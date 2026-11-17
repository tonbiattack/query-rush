/**
 * SQLite 読み取り専用の実行基盤（Issue #2 / #9 / #13 / #14 / #15）。
 *
 *  - 読み取り専用接続でSQLiteを開く
 *  - 式は安全なパーサー（src/sql.js）を通してから実行する
 *  - ベーステーブルに条件を適用し、結果テーブルを生成できる
 *  - 前後テーブルの差分（残った行／消えた行）を返す
 *  - 100ms / 100行を超えたらエラーとして扱い、問題として成立させない
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG } from './config.js';
import { allDatasets } from './data.js';
import { safeExpression } from './sql.js';

/** テーブル名として使える識別子か（データ定義由来のみ通す） */
export function assertTableName(name) {
  const text = String(name ?? '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
    throw new Error(`テーブル名が不正です: ${text}`);
  }
  return text;
}

/**
 * 候補WHEREとして実行してよい式か。
 * 安全なパーサーを通し、許可されたノードだけであることを確認する。
 */
export function assertAllowedWhere(where, allowedColumns, allowedTables = []) {
  const text = String(where ?? '').trim();
  if (text.length === 0) throw new Error('WHEREが空です');
  return safeExpression(text, allowedColumns, allowedTables).sql;
}

/** データセットからテーブルを作る（開発・テスト用。既存ファイルは作り直す） */
export function createDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });

  const db = new DatabaseSync(dbPath);
  for (const dataset of allDatasets()) {
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
   * 任意のSELECTを実行する（内部で組み立てたSQLのみ）。
   * 時間・行数の上限を守り、例外は戻り値で返す。
   */
  function runSelect(sql) {
    const startedAt = performance.now();
    let rows = [];
    let error = null;
    let truncated = false;
    let columns = [];

    try {
      const statement = db.prepare(sql);
      columns = statement.columns().map((column) => column.name);
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

    return { ok: error === null, rows, columns, error, durationMs, overBudget, truncated };
  }

  /**
   * 候補WHEREを1つ実行する。
   * @returns {{ok: boolean, rows: object[], error: string|null, durationMs: number, overBudget: boolean, truncated: boolean}}
   */
  function runWhere(dataset, where) {
    const table = assertTableName(dataset.id);
    let condition;
    try {
      condition = assertAllowedWhere(where, dataset.columns, [table]);
    } catch (cause) {
      return {
        ok: false,
        rows: [],
        columns: [],
        error: cause instanceof Error ? cause.message : String(cause),
        durationMs: 0,
        overBudget: false,
        truncated: false,
      };
    }
    return runSelect(`SELECT * FROM ${table} WHERE ${condition} ORDER BY id`);
  }

  /**
   * 集計クエリを実行する（Issue #14）。
   * @param {object} dataset
   * @param {object} aggregate {groupBy, select, having, orderBy}
   */
  function runAggregate(dataset, aggregate) {
    const table = assertTableName(dataset.id);
    const selectParts = aggregate.select.map((entry) => {
      if (entry.column) {
        if (!dataset.columns.includes(entry.column)) {
          throw new Error(`許可されていない列です: ${entry.column}`);
        }
        return `${entry.column} AS "${entry.as}"`;
      }
      // 集計式は許可リストの関数のみ（COUNT/SUM/AVG/MIN/MAX）
      if (!/^(COUNT|SUM|AVG|MIN|MAX)\((?:(\*)|([A-Za-z_][A-Za-z0-9_]*))\)$/.test(entry.expr)) {
        throw new Error(`許可されていない集計式です: ${entry.expr}`);
      }
      const column = entry.expr.match(/\(([A-Za-z_][A-Za-z0-9_]*)\)/)?.[1];
      if (column && !dataset.columns.includes(column)) {
        throw new Error(`許可されていない列です: ${column}`);
      }
      return `${entry.expr} AS "${entry.as}"`;
    });

    if (!dataset.columns.includes(aggregate.groupBy)) {
      throw new Error(`許可されていない列です: ${aggregate.groupBy}`);
    }

    const parts = [`SELECT ${selectParts.join(', ')}`, `FROM ${table}`, `GROUP BY ${aggregate.groupBy}`];
    if (aggregate.having) {
      // HAVING は集計式の比較のみ許可する
      if (!/^(COUNT|SUM|AVG|MIN|MAX)\(\s*(?:\*|[A-Za-z_][A-Za-z0-9_]*)\s*\)\s*(?:>=|<=|!=|<>|=|>|<)\s*-?\d+(?:\.\d+)?$/.test(aggregate.having)) {
        throw new Error(`許可されていないHAVINGです: ${aggregate.having}`);
      }
      parts.push(`HAVING ${aggregate.having}`);
    }
    parts.push(`ORDER BY ${aggregate.orderBy ?? aggregate.groupBy}`);

    return runSelect(parts.join(' '));
  }

  /**
   * パイプライン（CTE / JOIN）を実行する（Issue #15）。
   * steps を順に適用し、各段の中間結果も返す。
   */
  function runPipeline(dataset, pipeline) {
    const table = assertTableName(dataset.id);
    const stages = [];
    let currentRows = baseRows(dataset);
    let currentName = table;

    try {
      for (const step of pipeline.steps) {
        const condition = assertAllowedWhere(step.where, dataset.columns, [table]);
        const result = runSelect(`SELECT * FROM ${currentName} WHERE ${condition} ORDER BY id`);
        if (!result.ok) return { ...result, stages };
        stages.push({ name: step.name, where: step.where, rows: result.rows });
        currentRows = result.rows;
        // 中間結果をテーブルとして持たせず、条件を積み重ねて表現する
        currentName = table;
      }

      let finalRows = currentRows;
      if (pipeline.finalWhere) {
        const condition = assertAllowedWhere(pipeline.finalWhere, dataset.columns, [table]);
        const result = runSelect(`SELECT * FROM ${table} WHERE ${condition} ORDER BY id`);
        if (!result.ok) return { ...result, stages };
        // 段の結果と最終条件の積を取る
        const allowed = new Set(result.rows.map((row) => row.id));
        finalRows = currentRows.filter((row) => allowed.has(row.id));
      }

      return {
        ok: true,
        rows: finalRows,
        columns: dataset.columns,
        error: null,
        durationMs: 0,
        overBudget: false,
        truncated: false,
        stages,
      };
    } catch (cause) {
      return {
        ok: false,
        rows: [],
        columns: dataset.columns,
        error: cause instanceof Error ? cause.message : String(cause),
        durationMs: 0,
        overBudget: false,
        truncated: false,
        stages,
      };
    }
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

  return { baseRows, runWhere, runAggregate, runPipeline, runSelect, diffRows, close, dbPath };
}

/** 結果行の同一性を判定する署名（列と値の両方を見る） */
export function signatureOf(rows, columns) {
  return JSON.stringify(rows.map((row) => columns.map((column) => row[column])));
}
