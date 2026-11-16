/**
 * データ設計の下調べ用。WHERE の全組み合わせ × 並び × LIMIT で
 * どの行が返るかを一覧する（開発時の確認用。ゲームからは使わない）。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, openEngine } from '../src/engine.js';

const dir = mkdtempSync(join(tmpdir(), 'query-rush-'));
const dbPath = join(dir, 'peek.db');
createDatabase(dbPath);
const engine = openEngine(dbPath);

const wheres = [
  [],
  ['w_price'],
  ['w_list'],
  ['w_returned'],
  ['w_stock'],
  ['w_price', 'w_list'],
  ['w_price', 'w_returned'],
  ['w_price', 'w_stock'],
  ['w_list', 'w_returned'],
  ['w_list', 'w_stock'],
  ['w_returned', 'w_stock'],
  ['w_price', 'w_list', 'w_returned'],
  ['w_price', 'w_list', 'w_stock'],
  ['w_price', 'w_returned', 'w_stock'],
  ['w_list', 'w_returned', 'w_stock'],
  ['w_price', 'w_list', 'w_returned', 'w_stock'],
];

for (const orderBy of ['o_sales', 'o_count']) {
  for (const limit of [null, 'l_3']) {
    console.log(`\n=== ${orderBy} / ${limit ?? 'no limit'} ===`);
    for (const where of wheres) {
      const r = engine.run({ where, groupBy: null, orderBy, limit });
      const ids = r.rows.map((row) => row.id).join(',');
      console.log(`${(where.join('+') || '(none)').padEnd(46)} n=${String(r.rows.length).padStart(2)}  ${ids}`);
    }
  }
}

console.log('\n=== GROUP BY category ===');
for (const orderBy of ['o_sales', 'o_count']) {
  const r = engine.run({ where: [], groupBy: 'g_category', orderBy, limit: null });
  console.log(`${orderBy}: ${r.rows.map((row) => `${row.category}(${row['件数']}/${row['売上']})`).join(' ')}`);
}

engine.close();
rmSync(dir, { recursive: true, force: true });
