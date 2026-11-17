import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../src/config.js';
import { createDatabase, openEngine } from '../src/engine.js';
import { buildModeBank, buildQuestionBank } from '../src/questions.js';
import {
  buildQueue,
  createGame,
  potentialScore,
  scoreForAnswer,
  speedBonus,
  streakBonus,
} from '../src/game.js';

let dir;
let engine;
let bank;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'query-rush-game-'));
  const dbPath = join(dir, 'test.db');
  createDatabase(dbPath);
  engine = openEngine(dbPath);
  bank = buildQuestionBank(engine);
});

after(() => {
  engine.close();
  rmSync(dir, { recursive: true, force: true });
});

/** 時計を手で進められるゲームを作る */
function makeGame({ seed = 1, mode = 'filter', questionSeconds } = {}) {
  let clock = 1_000_000;
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const game = createGame({
    bank: bank[mode],
    mode,
    rng,
    now: () => clock,
    questionSeconds,
  });
  return {
    game,
    advance: (ms) => {
      clock += ms;
    },
  };
}

describe('speedBonus', () => {
  test('残り時間の割合に比例する', () => {
    assert.equal(speedBonus(5000, 5000), CONFIG.speedBonusMax);
    assert.equal(speedBonus(0, 5000), 0);
    assert.equal(speedBonus(2500, 5000), CONFIG.speedBonusMax / 2);
  });

  test('壊れた値でも落ちない', () => {
    assert.equal(speedBonus(Number.NaN, 5000), 0);
    assert.equal(speedBonus(1000, 0), 0);
    assert.equal(speedBonus(-100, 5000), 0);
    assert.equal(speedBonus(9999, 5000), CONFIG.speedBonusMax);
  });
});

describe('streakBonus', () => {
  test('連続正解で増えて上限で頭打ち', () => {
    assert.equal(streakBonus(0), 0);
    assert.equal(streakBonus(1), CONFIG.streakStep);
    assert.equal(streakBonus(1000), CONFIG.streakBonusMax);
  });
});

describe('scoreForAnswer', () => {
  test('正解は基本＋速度＋ストリーク', () => {
    const score = scoreForAnswer({
      outcome: 'correct',
      remainingMs: 5000,
      limitMs: 5000,
      streakBefore: 2,
    });
    assert.equal(score.base, CONFIG.basePoints);
    assert.equal(score.speed, CONFIG.speedBonusMax);
    assert.equal(score.streak, CONFIG.streakStep * 2);
  });

  test('1問の最大は300点', () => {
    const max = scoreForAnswer({
      outcome: 'correct',
      remainingMs: 5000,
      limitMs: 5000,
      streakBefore: 100,
    });
    assert.equal(max.total, 300);
  });

  test('不正解・時間切れは0点', () => {
    for (const outcome of ['incorrect', 'timeout']) {
      assert.equal(scoreForAnswer({ outcome, remainingMs: 5000, limitMs: 5000, streakBefore: 9 }).total, 0);
    }
  });

  test('速いほど高い（スコア減衰）', () => {
    assert.ok(potentialScore(5000, 5000, 0).total > potentialScore(1000, 5000, 0).total);
  });
});

describe('buildQueue（#10 偏り防止）', () => {
  test('同じデータセットの連続を最小限に抑える', () => {
    const questions = bank.filter;
    const queue = buildQueue(questions, () => 0.5);
    let consecutive = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].datasetId === queue[i - 1].datasetId) consecutive += 1;
    }
    // データセット数に対して問題数が偏っているので完全ゼロにはできないが、
    // 大半は連続を避けられていること
    assert.ok(consecutive <= 3, `連続が多すぎる: ${consecutive}`);
  });

  test('直近に出た問題を後ろへ回す', () => {
    const questions = bank.filter;
    const recentIds = questions.slice(0, 10).map((q) => q.id);
    const queue = buildQueue(questions, Math.random, { recentIds });
    const firstTen = queue.slice(0, 10).map((q) => q.id);
    const overlap = firstTen.filter((id) => recentIds.includes(id));
    assert.ok(overlap.length <= 2, `直近の問題が先頭に来すぎ: ${overlap.length}`);
  });

  test('全問が含まれる（取りこぼさない）', () => {
    const questions = bank.filter;
    const queue = buildQueue(questions, Math.random);
    assert.equal(queue.length, questions.length);
    assert.equal(new Set(queue.map((q) => q.id)).size, questions.length);
  });
});

describe('createGame', () => {
  test('開始直後はplayingで問題が1問だけ提示される', () => {
    const { game } = makeGame();
    const view = game.start();
    assert.equal(view.status, 'playing');
    assert.equal(view.phase, 'answering');
    assert.ok(view.question.id);
    assert.equal(view.choices.length, CONFIG.choiceCount);
    assert.equal(view.remainingSessionMs, CONFIG.timeAttackSeconds * 1000);
  });

  test('モードごとに制限時間が変わる', () => {
    const filter = makeGame({ mode: 'filter' }).game.start();
    assert.equal(filter.questionLimitMs, 5000);

    const advanced = makeGame({ mode: 'advanced' }).game.start();
    assert.equal(advanced.questionLimitMs, 8000);

    const pipeline = makeGame({ mode: 'pipeline' }).game.start();
    assert.equal(pipeline.questionLimitMs, 15000);
  });

  test('選択肢には正解がちょうど1つ含まれる', () => {
    const { game } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    assert.equal(view.choices.filter((c) => c.id === question.correct.id).length, 1);
  });

  test('正解すると得点が入り、ストリークが伸びる', () => {
    const { game } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    const answered = game.answer(question.correct.id);
    assert.equal(answered.phase, 'revealed');
    assert.equal(answered.reveal.outcome, 'correct');
    assert.ok(answered.score > 0);
    assert.equal(answered.streak, 1);
  });

  test('不正解でも止まらず、0点でストリークが切れる', () => {
    const { game } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    const wrong = view.choices.find((c) => c.id !== question.correct.id);
    const answered = game.answer(wrong.id);
    assert.equal(answered.reveal.outcome, 'incorrect');
    assert.equal(answered.score, 0);
    assert.equal(answered.streak, 0);
    assert.equal(answered.status, 'playing');
  });

  /* ── #7 正誤表示中はタイマーが止まる ─────────────── */

  test('#7 正誤表示中に10秒待っても残り時間が減らない', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    game.answer(question.correct.id);

    const before = game.view().remainingSessionMs;
    advance(10_000);
    const after = game.view().remainingSessionMs;
    assert.equal(after, before, '正誤表示中にセッション残り時間が減っている');
  });

  test('#7 次の問題に進むと停止した時点の残り時間から再開する', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);

    advance(2000); // 2秒使う
    const beforeAnswer = game.view().remainingSessionMs;
    game.answer(question.correct.id);

    advance(10_000); // 正誤表示で10秒待つ
    const next = game.next();

    // 停止時間は消費されていない
    assert.equal(next.remainingSessionMs, beforeAnswer);
    assert.equal(next.phase, 'answering');
  });

  test('#7 1問の制限時間は停止の影響を受けない', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    game.answer(question.correct.id);
    advance(10_000);
    const next = game.next();
    assert.equal(next.remainingQuestionMs, 5000);
  });

  test('#7 スコア計算に停止時間の副作用がない', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    const answered = game.answer(question.correct.id);
    const scoreAfterAnswer = answered.score;

    advance(10_000);
    assert.equal(game.view().score, scoreAfterAnswer);
  });

  test('#7 正誤表示中は時間切れにならない', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    game.answer(question.correct.id);

    // セッション全体の60秒を超える時間を待っても、revealed中は終了しない
    advance(CONFIG.timeAttackSeconds * 1000 + 5000);
    const view2 = game.view();
    assert.equal(view2.status, 'playing');
    assert.equal(view2.phase, 'revealed');
  });

  test('#7 停止時間の累積がセッション終了時刻に反映される', () => {
    const { game, advance } = makeGame();
    game.start();
    // 3問連続で正誤表示中に5秒待つ
    for (let i = 0; i < 3; i += 1) {
      const view = game.view();
      const question = bank.filter.find((q) => q.id === view.question.id);
      game.answer(question.correct.id);
      advance(5000);
      game.next();
    }
    // 15秒ぶん延長されているので、まだ残り時間は多い
    const remaining = game.view().remainingSessionMs;
    assert.ok(remaining > CONFIG.timeAttackSeconds * 1000 - 1000, `残り時間が想定より少ない: ${remaining}`);
  });

  test('時間切れは0点でストリークが切れ、進行は止まらない', () => {
    const { game, advance } = makeGame();
    game.start();
    const question = bank.filter.find((q) => q.id === game.view().question.id);
    game.answer(question.correct.id);
    game.next();

    advance(5000);
    const timedOut = game.tick();
    assert.equal(timedOut.phase, 'revealed');
    assert.equal(timedOut.reveal.outcome, 'timeout');
    assert.equal(timedOut.streak, 0);
    assert.equal(timedOut.status, 'playing');
  });

  test('締切後の回答は時間切れとして扱う（二重集計しない）', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.filter.find((q) => q.id === view.question.id);
    advance(5001);
    const answered = game.answer(question.correct.id);
    assert.equal(answered.reveal.outcome, 'timeout');
    assert.equal(answered.correct, 0);
    assert.equal(answered.answered, 1);
  });

  test('60秒経過で終了し、以降は操作できない', () => {
    const { game, advance } = makeGame();
    game.start();
    advance(CONFIG.timeAttackSeconds * 1000 + 1);
    const over = game.view();
    assert.equal(over.status, 'over');
    assert.equal(over.remainingSessionMs, 0);
    assert.equal(game.answer('anything').status, 'over');
  });

  test('スコア・正解数・最大ストリーク・ミス回数が残る', () => {
    const { game } = makeGame();
    game.start();
    for (let i = 0; i < 3; i += 1) {
      const question = bank.filter.find((q) => q.id === game.view().question.id);
      game.answer(question.correct.id);
      game.next();
    }
    const view = game.view();
    const question = bank.filter.find((q) => q.id === view.question.id);
    const wrong = view.choices.find((c) => c.id !== question.correct.id);
    game.answer(wrong.id);

    const result = game.view();
    assert.equal(result.correct, 3);
    assert.equal(result.maxStreak, 3);
    assert.equal(result.misses, 1);
    assert.equal(result.streak, 0);
  });

  test('問題は常時1問だけ', () => {
    const { game } = makeGame();
    const view = game.start();
    assert.equal(typeof view.question, 'object');
    assert.equal(Array.isArray(view.question), false);
    assert.equal('questions' in view, false);
  });

  test('開始前は操作を受け付けない', () => {
    const { game } = makeGame();
    assert.equal(game.answer('anything').status, 'idle');
  });

  /* ── モード別 ─────────────────────────────────── */

  test('全モードで問題が生成され、開始できる', () => {
    for (const mode of Object.keys(bank)) {
      assert.ok(bank[mode].length > 0, `${mode} に問題がない`);
      const { game } = makeGame({ mode });
      const view = game.start();
      assert.equal(view.status, 'playing', mode);
      assert.equal(view.mode, mode);
      assert.ok(view.question.id, mode);
    }
  });

  test('全モードで正解を選ぶと得点が入る', () => {
    for (const mode of Object.keys(bank)) {
      const { game } = makeGame({ mode });
      const view = game.start();
      const question = bank[mode].find((q) => q.id === view.question.id);
      const answered = game.answer(question.correct.id);
      assert.equal(answered.reveal.outcome, 'correct', mode);
      assert.ok(answered.score > 0, mode);
    }
  });

  test('カテゴリ別の正誤が記録される（#16）', () => {
    const { game } = makeGame({ mode: 'master' });
    game.start();
    const question = bank.master.find((q) => q.id === game.view().question.id);
    game.answer(question.correct.id);
    const view = game.view();
    const category = question.category;
    assert.ok(view.byCategory[category]);
    assert.equal(view.byCategory[category].correct, 1);
    assert.equal(view.byCategory[category].total, 1);
  });
});
