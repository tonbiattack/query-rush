/**
 * SQLite 読み取り専用クエリ実行基盤。
 *
 * 受け入れ条件（Issue #2）:
 *  - 読み取り専用接続でSQLiteを開く
 *  - SELECT以外は実行前に拒否する
 *  - チップを置く／外すたびに実行し、結果行とハイライト対象を返す
 *  - 前回との差分（増えた行／減った行／並びの変化）を返す
 *  - 100ms / 100行を超えたらコスト超過として扱う（例外で落とさない）
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_SQL, SEED_ROWS } from './data.js';
import { CHIP_BY_ID, normalizePlacement } from './chips.js';
import { CONFIG } from './config.js';

/** 生成SQLに紛れ込ませたくない句。SELECT以外は実行させない */
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace|trigger|union|into|load_extension)\b/i;

/**
 * SELECT のみ許可する。チップから生成したSQLだけが通る想定だが、
 * 生成側の不具合で危険なSQLが出ても実行させないための二重の壁。
 */
export function assertSelectOnly(sql) {
  const text = String(sql ?? '').trim();
  if (!/^select\b/i.test(text)) throw new Error('SELECT以外は実行できません');
  if (text.includes(';')) throw new Error('複数文は実行できません');
  if (FORBIDDEN.test(text)) throw new Error('許可されていない句が含まれています');
  return text;
}

/**
 * チップ配置からSELECTを組み立てる。
 *
 * 同値の並びを一意にするため、ORDER BY には必ず安定キー（id / category）を足す。
 * これがないと「重複行」の罠で判定がぶれる。
 */
export function buildQuery(rawPlacement) {
  const p = normalizePlacement(rawPlacement);
  const grouped = p.groupBy !== null;
  const parts = [];

  parts.push(grouped ? 'SELECT category, COUNT(*) AS 件数, SUM(sales) AS 売上' : 'SELECT *');
  parts.push('FROM items');

  const wheres = p.where.map((id) => CHIP_BY_ID.get(id).sql);
  if (wheres.length > 0) parts.push(`WHERE ${wheres.join(' AND ')}`);
  if (grouped) parts.push('GROUP BY category');

  if (p.orderBy) {
    const column = CHIP_BY_ID.get(p.orderBy).sql.split(/\s+/)[0];
    if (grouped) {
      const aggregate = column === 'sales' ? 'SUM(sales)' : 'COUNT(*)';
      parts.push(`ORDER BY ${aggregate} DESC, category`);
    } else {
      parts.push(`ORDER BY ${column} DESC, id`);
    }
  }

  if (p.limit) parts.push(`LIMIT ${CHIP_BY_ID.get(p.limit).sql}`);

  return parts.join(' ');
}

/** 結果行を一意に識別するキー。集計時は category、通常時は id */
export function rowKeyOf(placement) {
  return normalizePlacement(placement).groupBy !== null ? 'category' : 'id';
}

/** データベースを生成する（開発・テスト用。既存ファイルは作り直す） */
export function createDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  if (existsSync(dbPath)) rmSync(dbPath);

  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA_SQL);
  const insert = db.prepare(
    'INSERT INTO items (id, item, category, price, list_price, status, sales, sales_count, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  db.exec('BEGIN');
  for (const row of SEED_ROWS) insert.run(...row);
  db.exec('COMMIT');
  db.close();
  return dbPath;
}

/** 読み取り専用接続でエンジンを開く */
export function openEngine(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  /** 全行（ライブプレビューの下地。UIが「絞り込まれる前」を描くのに使う） */
  function allRows() {
    return db.prepare('SELECT * FROM items ORDER BY id').all().map((r) => ({ ...r }));
  }

  /**
   * 配置を実行する。例外は投げず、error に載せて返す。
   * @param {object} placement
   * @param {object[]} [prevRows] 前回の結果行（差分計算用）
   */
  function run(placement, prevRows = []) {
    const normalized = normalizePlacement(placement);
    const sql = buildQuery(normalized);
    const key = rowKeyOf(normalized);

    const startedAt = performance.now();
    let columns = [];
    let rows = [];
    let error = null;

    try {
      assertSelectOnly(sql);
      const statement = db.prepare(sql);
      columns = statement.columns().map((c) => c.name);
      // 最大100行だけ保持し、101行目で上限超過と判断する。
      // 制限時間も反復中に確認し、超過した結果は不完全として扱う。
      for (const row of statement.iterate()) {
        if (performance.now() - startedAt > CONFIG.queryTimeoutMs) {
          error = 'クエリの制限時間を超えました';
          break;
        }
        rows.push({ ...row });
        if (rows.length > CONFIG.maxRows) break;
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }

    const durationMs = performance.now() - startedAt;

    // 取得上限を超えたら切り詰めて「コスト超過」として扱う
    const truncated = rows.length > CONFIG.maxRows;
    if (truncated) {
      rows = rows.slice(0, CONFIG.maxRows);
      error = '取得上限を超えました';
    }

    const overBudget = durationMs > CONFIG.queryTimeoutMs;
    if (overBudget && !error) error = 'クエリの制限時間を超えました';

    return {
      sql,
      columns,
      rows,
      key,
      error,
      durationMs: Math.round(durationMs * 100) / 100,
      overBudget,
      truncated,
      diff: error ? { added: [], removed: [], moved: [] } : diffRows(prevRows, rows, key),
      highlight: error ? [] : rows.map((r) => r[key]),
    };
  }

  function close() {
    db.close();
  }

  return { run, allRows, close, dbPath };
}

/**
 * 前回結果との差分。
 * added   … 今回増えた行のキー
 * removed … 今回消えた行のキー
 * moved   … 両方に居るが順位が変わった行のキー
 */
export function diffRows(prevRows, nextRows, key) {
  const prevKeys = prevRows.map((r) => r[key]);
  const nextKeys = nextRows.map((r) => r[key]);
  const prevSet = new Set(prevKeys);
  const nextSet = new Set(nextKeys);

  const added = nextKeys.filter((k) => !prevSet.has(k));
  const removed = prevKeys.filter((k) => !nextSet.has(k));

  const prevIndex = new Map(prevKeys.map((k, i) => [k, i]));
  const moved = nextKeys.filter((k, i) => prevIndex.has(k) && prevIndex.get(k) !== i);

  return { added, removed, moved };
}
