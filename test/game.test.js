import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../src/config.js';
import { createDatabase, openEngine } from '../src/engine.js';
import { buildQuestionBank } from '../src/questions.js';
import {
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
function makeGame({ seed = 1, questionSeconds = 5 } = {}) {
  let clock = 1_000_000;
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const game = createGame({ bank, rng, now: () => clock, questionSeconds });
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
    assert.equal(score.total, CONFIG.basePoints + CONFIG.speedBonusMax + CONFIG.streakStep * 2);
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
      const score = scoreForAnswer({ outcome, remainingMs: 5000, limitMs: 5000, streakBefore: 9 });
      assert.equal(score.total, 0);
    }
  });

  test('速いほど高い（スコア減衰）', () => {
    const fast = potentialScore(5000, 5000, 0);
    const slow = potentialScore(1000, 5000, 0);
    assert.ok(fast.total > slow.total);
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
    assert.equal(view.remainingQuestionMs, 5000);
  });

  test('選択肢には正解がちょうど1つ含まれる', () => {
    const { game } = makeGame();
    const view = game.start();
    const question = bank.find((q) => q.id === view.question.id);
    const correctChoices = view.choices.filter((choice) => choice.id === question.correct.id);
    assert.equal(correctChoices.length, 1);
  });

  test('正解すると得点が入り、ストリークが伸びる', () => {
    const { game } = makeGame();
    const view = game.start();
    const question = bank.find((q) => q.id === view.question.id);

    const answered = game.answer(question.correct.id);
    assert.equal(answered.phase, 'revealed');
    assert.equal(answered.reveal.outcome, 'correct');
    assert.ok(answered.score > 0);
    assert.equal(answered.streak, 1);
    assert.equal(answered.correct, 1);
    assert.equal(answered.misses, 0);
  });

  test('不正解でも止まらず、0点でストリークが切れる', () => {
    const { game } = makeGame();
    const view = game.start();
    const question = bank.find((q) => q.id === view.question.id);
    const wrong = view.choices.find((choice) => choice.id !== question.correct.id);

    const answered = game.answer(wrong.id);
    assert.equal(answered.phase, 'revealed');
    assert.equal(answered.reveal.outcome, 'incorrect');
    assert.equal(answered.score, 0);
    assert.equal(answered.streak, 0);
    assert.equal(answered.misses, 1);
    // 進行は止まらない
    assert.equal(answered.status, 'playing');
  });

  test('正誤表示中はタイマーが止まる（残り時間が減らない）', () => {
    const { game, advance } = makeGame();
    const view = game.start();
    const question = bank.find((q) => q.id === view.question.id);
    game.answer(question.correct.id);

    const before = game.view().remainingQuestionMs;
    advance(3000);
    const after = game.view().remainingQuestionMs;
    assert.equal(after, before);
    assert.equal(after, 0);
  });

  test('「次へ」で次の問題へ進み、制限時間が戻る', () => {
    const { game } = makeGame();
    const view = game.start();
    const first = view.question.id;
    const question = bank.find((q) => q.id === first);
    game.answer(question.correct.id);

    const next = game.next();
    assert.equal(next.phase, 'answering');
    assert.equal(next.remainingQuestionMs, 5000);
    assert.equal(next.reveal, null);
  });

  test('正誤表示中でないと「次へ」は効かない', () => {
    const { game } = makeGame();
    const view = game.start();
    const before = view.question.id;
    const after = game.next();
    assert.equal(after.question.id, before);
  });

  test('時間切れは0点でストリークが切れ、進行は止まらない', () => {
    const { game, advance } = makeGame();
    game.start();
    const question = bank.find((q) => q.id === game.view().question.id);
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
    const question = bank.find((q) => q.id === view.question.id);
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

    const answered = game.answer('anything');
    assert.equal(answered.status, 'over');
  });

  test('スコア・正解数・最大ストリーク・ミス回数が残る', () => {
    const { game } = makeGame();
    game.start();
    for (let i = 0; i < 3; i += 1) {
      const question = bank.find((q) => q.id === game.view().question.id);
      game.answer(question.correct.id);
      game.next();
    }
    // 1問ミス
    const view = game.view();
    const question = bank.find((q) => q.id === view.question.id);
    const wrong = view.choices.find((choice) => choice.id !== question.correct.id);
    game.answer(wrong.id);

    const result = game.view();
    assert.equal(result.correct, 3);
    assert.equal(result.maxStreak, 3);
    assert.equal(result.misses, 1);
    assert.equal(result.streak, 0);
    assert.ok(result.score > 0);
  });

  test('制限時間は3／5／8秒から選べる', () => {
    for (const seconds of CONFIG.questionSecondsOptions) {
      const { game } = makeGame({ questionSeconds: seconds });
      const view = game.start();
      assert.equal(view.questionLimitMs, seconds * 1000);
      assert.equal(view.remainingQuestionMs, seconds * 1000);
    }
  });

  test('問題は常時1問だけ（同時に2問以上出さない）', () => {
    const { game } = makeGame();
    const view = game.start();
    assert.equal(typeof view.question, 'object');
    assert.equal(Array.isArray(view.question), false);
    assert.equal('questions' in view, false);
  });

  test('問題が尽きたら先頭へ戻って続ける', () => {
    const { game } = makeGame();
    game.start();
    const seen = new Set();
    for (let i = 0; i < bank.length + 3; i += 1) {
      const view = game.view();
      if (view.status !== 'playing') break;
      seen.add(view.question.id);
      const question = bank.find((q) => q.id === view.question.id);
      game.answer(question.correct.id);
      game.next();
    }
    assert.ok(seen.size > 0);
  });

  test('開始前は操作を受け付けない', () => {
    const { game } = makeGame();
    const view = game.answer('anything');
    assert.equal(view.status, 'idle');
  });
});
