/**
 * SQLite 読み取り専用の実行基盤（Issue #2）。
 *
 *  - 読み取り専用接続でSQLiteを開く
 *  - 候補 WHERE は許可された形式（単一の条件式）のみ実行し、それ以外は実行前に拒否する
 *  - ベーステーブルに各候補を適用し、絞り込み後テーブルを生成できる
 *  - 前後テーブル間の差分（残った行／消えた行）を返す
 *  - 100ms / 100行を超えたらエラーとして扱い、問題として成立させない
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG } from './config.js';
import { DATASETS } from './data.js';

/**
 * 許可する WHERE の形。
 *
 * 単一の比較式だけを通す。`OR`・`AND`・サブクエリ・関数呼び出し・
 * セミコロン・コメントはすべて拒否する（候補はデータ側で定義済みだが、
 * 生成側の不具合で危険な式が出ても実行させないための二重の壁）。
 */
const ALLOWED_WHERE =
  /^\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:>=|<=|!=|<>|=|>|<)\s*(?:-?\d+(?:\.\d+)?|'(?:[^']|'')*')\s*$/i;

const ALLOWED_IS_NULL = /^\s*[A-Za-z_][A-Za-z0-9_]*\s+IS\s+(?:NOT\s+)?NULL\s*$/i;

/** 候補WHEREとして実行してよい式か */
export function assertAllowedWhere(where) {
  const text = String(where ?? '').trim();
  if (text.length === 0) throw new Error('WHEREが空です');
  if (text.includes(';') || text.includes('--') || text.includes('/*')) {
    throw new Error('WHEREに許可されない記号が含まれています');
  }
  if (!ALLOWED_WHERE.test(text) && !ALLOWED_IS_NULL.test(text)) {
    throw new Error(`WHEREの形式が許可されていません: ${text}`);
  }
  return text;
}

/** テーブル名として使える識別子か（データ定義由来のみ通す） */
export function assertTableName(name) {
  const text = String(name ?? '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`テーブル名が不正です: ${text}`);
  }
  return text;
}

/** データセットからテーブルを作る（開発・テスト用。既存ファイルは作り直す） */
export function createDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });

  const db = new DatabaseSync(dbPath);
  for (const dataset of DATASETS) {
    const table = assertTableName(dataset.id);
    const columns = dataset.columns;
    const types = columns.map((column) => {
      const sample = dataset.rows.find((row) => row[column] !== null)?.[column];
      return typeof sample === 'number' ? 'INTEGER' : 'TEXT';
    });
    db.exec(
      `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, ${columns
        .map((column, index) => `${column} ${types[index]}`)
        .join(', ')})`,
    );
    const insert = db.prepare(
      `INSERT INTO ${table} (id, ${columns.join(', ')}) VALUES (${['?', ...columns.map(() => '?')].join(', ')})`,
    );
    db.exec('BEGIN');
    for (const row of dataset.rows) insert.run(row.id, ...columns.map((column) => row[column]));
    db.exec('COMMIT');
  }
  db.close();
  return dbPath;
}

/**
 * 読み取り専用接続でエンジンを開く。
 * 実行結果は例外ではなく戻り値で返す（問題生成を止めないため）。
 */
export function openEngine(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  /** テーブルの全行（絞り込み前） */
  function baseRows(dataset) {
    const table = assertTableName(dataset.id);
    return db
      .prepare(`SELECT * FROM ${table} ORDER BY id`)
      .all()
      .map((row) => ({ ...row }));
  }

  /**
   * 候補WHEREを1つ実行する。
   * @returns {{ok: boolean, rows: object[], error: string|null, durationMs: number, overBudget: boolean, truncated: boolean}}
   */
  function runWhere(dataset, where) {
    const table = assertTableName(dataset.id);
    const startedAt = performance.now();
    let rows = [];
    let error = null;
    let truncated = false;

    try {
      const condition = assertAllowedWhere(where);
      const statement = db.prepare(`SELECT * FROM ${table} WHERE ${condition} ORDER BY id`);
      for (const row of statement.iterate()) {
        if (performance.now() - startedAt > CONFIG.queryTimeoutMs) {
          error = 'クエリの制限時間を超えました';
          break;
        }
        rows.push({ ...row });
        if (rows.length > CONFIG.maxRows) {
          truncated = true;
          break;
        }
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }

    const durationMs = performance.now() - startedAt;
    const overBudget = durationMs > CONFIG.queryTimeoutMs;
    if (overBudget && !error) error = 'クエリの制限時間を超えました';
    if (truncated) {
      rows = rows.slice(0, CONFIG.maxRows);
      if (!error) error = '取得上限を超えました';
    }

    return { ok: error === null, rows, error, durationMs, overBudget, truncated };
  }

  /**
   * 前後テーブルの差分。ハイライト表示に使う。
   * kept … 絞り込み後にも残った行の id
   * removed … 消えた行の id
   */
  function diffRows(before, after) {
    const afterIds = new Set(after.map((row) => row.id));
    const beforeIds = new Set(before.map((row) => row.id));
    return {
      kept: after.map((row) => row.id),
      removed: before.filter((row) => !afterIds.has(row.id)).map((row) => row.id),
      added: after.filter((row) => !beforeIds.has(row.id)).map((row) => row.id),
    };
  }

  function close() {
    db.close();
  }

  return { baseRows, runWhere, diffRows, close, dbPath };
}

/** 結果行の同一性を判定する署名（列と値の両方を見る） */
export function signatureOf(rows, columns) {
  return JSON.stringify(rows.map((row) => columns.map((column) => row[column])));
}
