/**
 * 一意な配置（同じ結果になる別解が存在しない配置）を洗い出す開発用スクリプト。
 * 注文の answer はここから選ぶ。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, openEngine, buildQuery } from '../src/engine.js';
import { enumeratePlacements, signatureOf } from './check-orders.js';

const dir = mkdtempSync(join(tmpdir(), 'query-rush-'));
const dbPath = join(dir, 'uniq.db');
createDatabase(dbPath);
const engine = openEngine(dbPath);

const bySig = new Map();
for (const placement of enumeratePlacements()) {
  const sig = signatureOf(engine.run(placement));
  if (!bySig.has(sig)) bySig.set(sig, []);
  bySig.get(sig).push(placement);
}

const unique = [...bySig.entries()].filter(([, list]) => list.length === 1);
console.log(`全配置 ${enumeratePlacements().length} / 一意な結果 ${unique.length}\n`);

for (const [sig, [placement]] of unique) {
  const r = engine.run(placement);
  const ids = r.rows.map((row) => row.id ?? row.category).join(',');
  console.log(`${buildQuery(placement)}`);
  console.log(`    n=${r.rows.length}  ${ids}\n`);
}

engine.close();
rmSync(dir, { recursive: true, force: true });
