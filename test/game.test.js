import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, openEngine } from '../src/engine.js';
import { comboMultiplier, createGame, scoreForServe } from '../src/game.js';
import { CONFIG } from '../src/config.js';
import { ORDERS } from '../src/orders.js';

let dir;
let engine;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'query-rush-game-'));
  const dbPath = join(dir, 'game.db');
  createDatabase(dbPath);
  engine = openEngine(dbPath);
});

after(() => {
  engine.close();
  rmSync(dir, { recursive: true, force: true });
});

/** 時計を手で進められるゲームを作る */
function makeGame({ seed = 1 } = {}) {
  let clock = 1_000_000;
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const game = createGame({ engine, rng, now: () => clock });
  return {
    game,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
}

/** 現在の注文の答えを配置する */
function solveCurrent(game) {
  const order = game.currentOrder();
  for (const id of order.answer.where) game.toggleChip(id);
  if (order.answer.groupBy) game.toggleChip(order.answer.groupBy);
  if (order.answer.orderBy) game.toggleChip(order.answer.orderBy);
  if (order.answer.limit) game.toggleChip(order.answer.limit);
  return order;
}

describe('comboMultiplier', () => {
  test('コンボ0は等倍、伸びて上限で頭打ち', () => {
    assert.equal(comboMultiplier(0), 1);
    assert.equal(comboMultiplier(1), 1 + CONFIG.comboStep);
    assert.equal(comboMultiplier(1000), CONFIG.comboMaxMultiplier);
  });
});

describe('scoreForServe', () => {
  test('速いほど時間ボーナスが乗る', () => {
    const fast = scoreForServe({ combo: 0, elapsedSeconds: 1 });
    const slow = scoreForServe({ combo: 0, elapsedSeconds: 7 });
    assert.ok(fast.timeBonus > slow.timeBonus);
    assert.ok(fast.total > slow.total);
  });

  test('窓を超えると時間ボーナスは0', () => {
    assert.equal(scoreForServe({ combo: 0, elapsedSeconds: 30 }).timeBonus, 0);
  });

  test('ノーミスで捌く方が速さより伸びる', () => {
    // コンボ5でゆっくり1件 vs コンボ0で最速1件
    const comboed = scoreForServe({ combo: 5, elapsedSeconds: 7 });
    const fastNoCombo = scoreForServe({ combo: 0, elapsedSeconds: 0 });
    assert.ok(comboed.total > fastNoCombo.total);
  });
});

describe('createGame', () => {
  test('開始直後はplayingで注文が1件だけ提示される', () => {
    const { game } = makeGame();
    const view = game.start();
    assert.equal(view.status, 'playing');
    assert.ok(view.order.id);
    assert.ok(view.order.ticket.length > 0);
    assert.ok(view.order.target.rows.length > 0);
    assert.equal(view.remainingMs, CONFIG.sprintSeconds * 1000);
  });

  test('チップを置くたびに結果が即時反映される', () => {
    const { game } = makeGame();
    game.start();
    const before = game.view();
    assert.equal(before.result.rows.length, engine.allRows().length);

    const after = game.toggleChip('w_returned');
    assert.ok(after.result.rows.length < before.result.rows.length);
    assert.ok(after.sql.includes("status != 'returned'"));
  });

  test('同じチップをもう一度押すと外れる', () => {
    const { game } = makeGame();
    game.start();
    game.toggleChip('w_returned');
    const off = game.toggleChip('w_returned');
    assert.deepEqual(off.placement.where, []);
  });

  test('同じスロットのチップは1枚だけ（ORDER BYの差し替え）', () => {
    const { game } = makeGame();
    game.start();
    game.toggleChip('o_sales');
    const view = game.toggleChip('o_count');
    assert.equal(view.placement.orderBy, 'o_count');
  });

  test('不明なチップはミスになりコンボが切れる', () => {
    const { game } = makeGame();
    game.start();
    solveCurrent(game);
    game.serve();
    const view = game.toggleChip('w_unknown');
    assert.equal(view.lastEvent.reason, 'invalid');
    assert.equal(view.combo, 0);
    assert.equal(view.misses, 1);
  });

  test('集計への切替時に異なるキーを差分へ混ぜない', () => {
    const { game } = makeGame();
    game.start();
    const grouped = game.toggleChip('g_category');
    assert.deepEqual(grouped.result.diff.removed, []);
    assert.ok(grouped.result.diff.added.every((key) => typeof key === 'string'));
    const normal = game.toggleChip('g_category');
    assert.deepEqual(normal.result.diff.removed, []);
    assert.ok(normal.result.diff.added.every((key) => typeof key === 'number'));
  });

  test('完成形と一致したときだけ提供でき、次の注文へ進む', () => {
    const { game } = makeGame();
    game.start();
    const first = game.currentOrder();
    solveCurrent(game);

    const served = game.serve();
    assert.equal(served.lastEvent.type, 'served');
    assert.equal(served.served, 1);
    assert.equal(served.combo, 1);
    assert.notEqual(served.order.id, first.id);
    assert.deepEqual(served.placement.where, []);
  });

  test('不一致のまま確定するとミスでコンボが切れる', () => {
    const { game } = makeGame();
    game.start();
    solveCurrent(game);
    game.serve(); // 1件提供してコンボ1

    const missed = game.serve(); // 何も置かずに提供
    assert.equal(missed.lastEvent.type, 'miss');
    assert.equal(missed.combo, 0);
    assert.equal(missed.misses, 1);
    assert.equal(missed.served, 1);
  });

  test('ミスしても注文は変わらない', () => {
    const { game } = makeGame();
    game.start();
    const order = game.currentOrder();
    const missed = game.serve();
    assert.equal(missed.lastEvent.type, 'miss');
    assert.equal(missed.order.id, order.id);
  });

  test('60秒経過でスコアが確定し、以降は操作できない', () => {
    const { game, advance } = makeGame();
    game.start();
    solveCurrent(game);
    game.serve();
    const scoreBefore = game.view().score;

    advance(CONFIG.sprintSeconds * 1000 + 1);
    const over = game.view();
    assert.equal(over.status, 'over');
    assert.equal(over.remainingMs, 0);
    assert.equal(over.score, scoreBefore);

    // 時間切れ後はチップも提供も受け付けない
    const afterChip = game.toggleChip('w_price');
    assert.deepEqual(afterChip.placement.where, []);
    assert.equal(game.serve().lastEvent.type, 'timeup');
  });

  test('捌いた件数・最大コンボ・ミス回数が内訳として残る', () => {
    const { game } = makeGame();
    game.start();
    for (let i = 0; i < 3; i += 1) {
      solveCurrent(game);
      game.serve();
    }
    game.serve(); // ミス

    const view = game.view();
    assert.equal(view.served, 3);
    assert.equal(view.maxCombo, 3);
    assert.equal(view.misses, 1);
    assert.equal(view.combo, 0);
  });

  test('注文は常時1件だけ（同時に2件以上出さない）', () => {
    const { game } = makeGame();
    const view = game.start();
    assert.equal(typeof view.order, 'object');
    assert.equal(Array.isArray(view.order), false);
    assert.equal(Object.keys(view).includes('orders'), false);
  });

  test('全注文が順に解ける（棚のチップだけで完成形に到達できる）', () => {
    const { game } = makeGame();
    game.start();
    const seen = new Set();
    for (let i = 0; i < ORDERS.length; i += 1) {
      const order = game.currentOrder();
      seen.add(order.id);
      solveCurrent(game);
      const view = game.serve();
      assert.equal(view.lastEvent.type, 'served', `${order.id} が解けない`);
    }
    assert.equal(seen.size, ORDERS.length);
  });

  test('開始前は操作を受け付けない', () => {
    const { game } = makeGame();
    const view = game.toggleChip('w_price');
    assert.equal(view.status, 'idle');
    assert.deepEqual(view.placement.where, []);
  });
});
