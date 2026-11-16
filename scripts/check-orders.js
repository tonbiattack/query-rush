/**
 * 注文の検証（Issue #4 の受け入れ条件を機械的に確かめる）。
 *
 *  1. 解ける       … 完成形のクエリがエラーにならず1行以上返す
 *  2. 一意         … 完成形と同じ結果になる別の配置が存在しない
 *  3. 全チップ必須 … 完成形からチップを1枚外すと結果が変わる（無駄なチップが無い）
 *  4. 罠が効く     … 同じスロットの別チップに差し替えると結果が変わる
 *  5. 衝突なし     … 注文どうしの完成形が同じにならない
 *
 * 使い方: npm run check:orders
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHIPS, emptyPlacement, normalizePlacement } from '../src/chips.js';
import { ORDERS } from '../src/orders.js';
import { buildQuery, createDatabase, openEngine } from '../src/engine.js';
import { resultsMatch } from '../src/game.js';

/** 棚のチップから作れる全配置を列挙する（WHEREは部分集合、他は1枚か無し） */
export function enumeratePlacements() {
  const wheres = CHIPS.filter((c) => c.slot === 'where').map((c) => c.id);
  const groups = [null, ...CHIPS.filter((c) => c.slot === 'groupBy').map((c) => c.id)];
  const orders = [null, ...CHIPS.filter((c) => c.slot === 'orderBy').map((c) => c.id)];
  const limits = [null, ...CHIPS.filter((c) => c.slot === 'limit').map((c) => c.id)];

  const out = [];
  for (let mask = 0; mask < 1 << wheres.length; mask += 1) {
    const where = wheres.filter((_, i) => mask & (1 << i));
    for (const groupBy of groups) {
      for (const orderBy of orders) {
        for (const limit of limits) {
          out.push(normalizePlacement({ where, groupBy, orderBy, limit }));
        }
      }
    }
  }
  return out;
}

/** 結果の同一性を判定するための署名 */
export function signatureOf(result) {
  if (result.error) return `error:${result.error}`;
  return JSON.stringify([result.columns, result.rows.map((r) => result.columns.map((column) => r[column]))]);
}

/** 完成形からチップを1枚外した配置を列挙する */
export function withoutEachChip(placement) {
  const p = normalizePlacement(placement);
  const out = [];
  for (const id of p.where) {
    out.push({ removed: id, placement: { ...p, where: p.where.filter((w) => w !== id) } });
  }
  for (const slot of ['groupBy', 'orderBy', 'limit']) {
    if (p[slot]) out.push({ removed: p[slot], placement: { ...p, [slot]: null } });
  }
  return out;
}

/** 完成形のチップを同じスロットの別チップに差し替えた配置を列挙する */
export function swapEachChip(placement) {
  const p = normalizePlacement(placement);
  const out = [];
  for (const id of p.where) {
    for (const chip of CHIPS.filter((c) => c.slot === 'where' && c.id !== id)) {
      out.push({ from: id, to: chip.id, placement: { ...p, where: p.where.map((w) => (w === id ? chip.id : w)) } });
    }
  }
  for (const slot of ['groupBy', 'orderBy', 'limit']) {
    if (!p[slot]) continue;
    for (const chip of CHIPS.filter((c) => c.slot === slot && c.id !== p[slot])) {
      out.push({ from: p[slot], to: chip.id, placement: { ...p, [slot]: chip.id } });
    }
  }
  return out;
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), 'query-rush-'));
  const dbPath = join(dir, 'check.db');
  createDatabase(dbPath);
  const engine = openEngine(dbPath);

  const placements = enumeratePlacements();
  console.log(`棚のチップから作れる配置: ${placements.length} 通り\n`);

  let failures = 0;
  const orderSignatures = new Map();

  for (const order of ORDERS) {
    const answer = normalizePlacement(order.answer);
    const result = engine.run(answer);
    const sig = signatureOf(result);
    const problems = [];

    if (result.error) {
      problems.push(`完成形のクエリがエラー: ${result.error}`);
    } else if (result.rows.length === 0) {
      problems.push('完成形が0行');
    }

    // 2. 一意
    const alternatives = placements
      .filter((placement) => JSON.stringify(placement) !== JSON.stringify(answer))
      .filter((placement) => resultsMatch(engine.run(placement), result))
      .map((placement) => ({ placement, sql: buildQuery(placement) }));
    if (alternatives.length > 0) {
      problems.push(`別解が${alternatives.length}通り: ${alternatives[0].sql}`);
    }

    // 3. 全チップ必須
    for (const { removed, placement } of withoutEachChip(answer)) {
      if (signatureOf(engine.run(placement)) === sig) problems.push(`チップ ${removed} が無くても同じ結果`);
    }

    // 4. 罠が効く
    for (const { from, to, placement } of swapEachChip(answer)) {
      if (signatureOf(engine.run(placement)) === sig) problems.push(`チップ ${from} → ${to} に差し替えても同じ結果`);
    }

    // 5. 衝突なし
    const dup = orderSignatures.get(sig);
    if (dup) problems.push(`注文 ${dup} と完成形が衝突`);
    orderSignatures.set(sig, order.id);

    const ok = problems.length === 0;
    if (!ok) failures += 1;

    console.log(`${ok ? '✓' : '✗'} ${order.id} (難易度${order.difficulty}) 行数=${result.rows.length}`);
    console.log(`    ${buildQuery(answer)}`);
    for (const problem of problems) console.log(`    ! ${problem}`);
  }

  engine.close();
  rmSync(dir, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\n${failures} 件の注文が条件を満たしていません`);
    process.exitCode = 1;
  } else {
    console.log('\nすべての注文が「解ける・一意・全チップ必須・罠が効く・衝突なし」を満たしています');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
