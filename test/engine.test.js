import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  assertSelectOnly,
  buildQuery,
  createDatabase,
  diffRows,
  openEngine,
  rowKeyOf,
} from '../src/engine.js';
import { CONFIG } from '../src/config.js';

let dir;
let dbPath;
let engine;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'query-rush-test-'));
  dbPath = join(dir, 'test.db');
  createDatabase(dbPath);
  engine = openEngine(dbPath);
});

after(() => {
  engine.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('assertSelectOnly', () => {
  test('SELECTは通る', () => {
    assert.equal(assertSelectOnly('SELECT * FROM items'), 'SELECT * FROM items');
  });

  test('SELECT以外は拒否する', () => {
    for (const sql of [
      'DELETE FROM items',
      'DROP TABLE items',
      'UPDATE items SET price = 0',
      'INSERT INTO items VALUES (1)',
      'PRAGMA table_info(items)',
      'ATTACH DATABASE "x" AS y',
    ]) {
      assert.throws(() => assertSelectOnly(sql), /SELECT以外|許可されていない/, sql);
    }
  });

  test('複数文は拒否する', () => {
    assert.throws(() => assertSelectOnly('SELECT * FROM items; DROP TABLE items'), /複数文/);
  });

  test('SELECTで始まらない小細工を拒否する', () => {
    assert.throws(() => assertSelectOnly('  -- comment\nDELETE FROM items'), /SELECT以外/);
  });
});

describe('buildQuery', () => {
  test('チップが無ければ全件SELECT', () => {
    assert.equal(buildQuery({}), 'SELECT * FROM items');
  });

  test('WHEREは棚の並び順で安定する', () => {
    const a = buildQuery({ where: ['w_stock', 'w_returned'] });
    const b = buildQuery({ where: ['w_returned', 'w_stock'] });
    assert.equal(a, b);
    assert.match(a, /WHERE status != 'returned' AND stock > 0/);
  });

  test('ORDER BYには安定キーを足す（重複行の罠対策）', () => {
    assert.match(buildQuery({ orderBy: 'o_sales' }), /ORDER BY sales DESC, id$/);
  });

  test('GROUP BY時は集計列を選び、並びも集計関数になる', () => {
    const sql = buildQuery({ groupBy: 'g_category', orderBy: 'o_sales' });
    assert.match(sql, /SELECT category, COUNT\(\*\) AS 件数, SUM\(sales\) AS 売上/);
    assert.match(sql, /GROUP BY category/);
    assert.match(sql, /ORDER BY SUM\(sales\) DESC, category/);
  });

  test('不正なチップIDは無視する', () => {
    assert.equal(buildQuery({ where: ['nope'], orderBy: 'w_price' }), 'SELECT * FROM items');
  });
});

describe('openEngine', () => {
  test('読み取り専用で開くので書き込みできない', () => {
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    assert.throws(() => ro.exec("INSERT INTO items (item) VALUES ('x')"), /readonly|read-only/i);
    ro.close();
  });

  test('全行を返す', () => {
    const rows = engine.allRows();
    assert.ok(rows.length >= 20);
    assert.ok(rows.every((r) => typeof r.item === 'string'));
  });

  test('チップ配置を実行して結果行とハイライト対象を返す', () => {
    const result = engine.run({ where: ['w_returned'], orderBy: 'o_sales', limit: 'l_3' });
    assert.equal(result.error, null);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.highlight, result.rows.map((r) => r.id));
    assert.ok(result.durationMs < CONFIG.queryTimeoutMs);
  });

  test('集計時はハイライト対象がcategoryになる', () => {
    const result = engine.run({ groupBy: 'g_category' });
    assert.equal(result.key, 'category');
    assert.deepEqual(result.highlight, result.rows.map((r) => r.category));
  });

  test('101行以上なら取得上限で打ち切る', () => {
    const path = join(dir, 'large.db');
    createDatabase(path);
    const writable = new DatabaseSync(path);
    writable.exec(`INSERT INTO items (item, category, price, list_price, status, sales, sales_count, stock)
      SELECT '追加', '一品', 100, 100, 'served', 100, 1, 1 FROM items a, items b LIMIT 100`);
    writable.close();
    const limited = openEngine(path);
    try {
      const result = limited.run({});
      assert.equal(result.truncated, true);
      assert.equal(result.rows.length, CONFIG.maxRows);
    } finally {
      limited.close();
    }
  });
});

describe('diffRows', () => {
  test('増えた行・減った行・並びの変化を返す', () => {
    const prev = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const next = [{ id: 2 }, { id: 1 }, { id: 4 }];
    const diff = diffRows(prev, next, 'id');
    assert.deepEqual(diff.added, [4]);
    assert.deepEqual(diff.removed, [3]);
    assert.deepEqual(diff.moved, [2, 1]);
  });

  test('変化が無ければ空', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    assert.deepEqual(diffRows(rows, rows, 'id'), { added: [], removed: [], moved: [] });
  });
});

describe('rowKeyOf', () => {
  test('集計時はcategory、通常時はid', () => {
    assert.equal(rowKeyOf({ groupBy: 'g_category' }), 'category');
    assert.equal(rowKeyOf({}), 'id');
  });
});
