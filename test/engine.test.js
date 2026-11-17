import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  assertAllowedWhere,
  assertTableName,
  createDatabase,
  openEngine,
  signatureOf,
} from '../src/engine.js';
import { CONFIG } from '../src/config.js';
import { DATASETS } from '../src/data.js';

let dir;
let dbPath;
let engine;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'query-rush-engine-'));
  dbPath = join(dir, 'test.db');
  createDatabase(dbPath);
  engine = openEngine(dbPath);
});

after(() => {
  engine.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('assertAllowedWhere', () => {
  test('単一の比較式は通る', () => {
    for (const where of [
      'price > 1000',
      'price >= 1000',
      "status != 'returned'",
      "status = 'paid'",
      'qty < 3',
      'stock IS NULL',
      'member IS NOT NULL',
      'total <= 960',
    ]) {
      assert.equal(assertAllowedWhere(where), where);
    }
  });

  test('複合条件・OR・サブクエリは拒否する', () => {
    for (const where of [
      'price > 1000 AND stock > 0',
      'price > 1000 OR stock > 0',
      'price > (SELECT 1)',
      'EXISTS (SELECT 1)',
      '1 = 1',
    ]) {
      assert.throws(() => assertAllowedWhere(where), /許可されていません/, where);
    }
  });

  test('文を継ぎ足す小細工を拒否する', () => {
    for (const where of [
      'price > 1000; DROP TABLE menu',
      'price > 1000 -- comment',
      'price > 1000 /* x */',
      '',
    ]) {
      assert.throws(() => assertAllowedWhere(where), /許可されない|空です/, where);
    }
  });
});

describe('assertTableName', () => {
  test('識別子だけ通す', () => {
    assert.equal(assertTableName('menu'), 'menu');
    for (const name of ['menu; DROP TABLE x', 'menu--', '1menu', '']) {
      assert.throws(() => assertTableName(name), /不正です/, name);
    }
  });
});

describe('openEngine', () => {
  test('読み取り専用で開くので書き込みできない', () => {
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    assert.throws(() => ro.exec("INSERT INTO menu (name) VALUES ('x')"), /readonly|read-only/i);
    ro.close();
  });

  test('絞り込み前の全行を返す', () => {
    for (const dataset of DATASETS) {
      const rows = engine.baseRows(dataset);
      assert.equal(rows.length, dataset.rows.length, dataset.id);
      assert.ok(rows.every((row) => typeof row.id === 'number'));
    }
  });

  test('候補WHEREを実行して絞り込み後テーブルを作れる', () => {
    const dataset = DATASETS.find((d) => d.id === 'menu');
    const result = engine.runWhere(dataset, "status != 'returned'");
    assert.equal(result.ok, true);
    assert.ok(result.rows.length > 0);
    assert.ok(result.rows.every((row) => row.status !== 'returned'));
    assert.ok(result.durationMs < CONFIG.queryTimeoutMs);
  });

  test('不正なWHEREは例外ではなくerrorで返す', () => {
    const dataset = DATASETS.find((d) => d.id === 'menu');
    const result = engine.runWhere(dataset, 'price > 1000; DROP TABLE menu');
    assert.equal(result.ok, false);
    assert.match(result.error, /許可されない/);
    assert.deepEqual(result.rows, []);
  });

  test('前後テーブルの差分（残った行／消えた行）を返す', () => {
    const dataset = DATASETS.find((d) => d.id === 'menu');
    const before = engine.baseRows(dataset);
    const after = engine.runWhere(dataset, "status = 'returned'").rows;
    const diff = engine.diffRows(before, after);

    assert.deepEqual(diff.kept, after.map((row) => row.id));
    assert.equal(diff.kept.length + diff.removed.length, before.length);
    assert.ok(diff.removed.length > 0);
    assert.deepEqual(diff.added, []);
  });

  test('取得上限を超えたら打ち切ってエラーにする', () => {
    // 上限を超える行を持つテーブルを別途作って確認する
    const bigPath = join(dir, 'big.db');
    createDatabase(bigPath);
    const writable = new DatabaseSync(bigPath);
    writable.exec(
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 150)
       INSERT INTO menu (name, price, list_price, status, stock)
       SELECT '追加' || n, 100, 100, 'served', 1 FROM seq`,
    );
    writable.close();

    const bigEngine = openEngine(bigPath);
    try {
      const dataset = DATASETS.find((d) => d.id === 'menu');
      const result = bigEngine.runWhere(dataset, 'price > 0');
      assert.equal(result.truncated, true);
      assert.equal(result.ok, false);
      assert.ok(result.rows.length <= CONFIG.maxRows);
    } finally {
      bigEngine.close();
    }
  });
});

describe('signatureOf', () => {
  test('列と値の両方で結果を区別する', () => {
    const columns = ['name', 'price'];
    const a = [{ name: 'x', price: 1 }];
    const b = [{ name: 'x', price: 2 }];
    assert.notEqual(signatureOf(a, columns), signatureOf(b, columns));
    assert.equal(signatureOf(a, columns), signatureOf([{ name: 'x', price: 1 }], columns));
  });
});
