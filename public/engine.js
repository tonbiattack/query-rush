/**
 * ブラウザ側のゲームエンジン（Issue #8）。
 *
 * サーバー版の src/game.js と同じルールを、静的JSONだけで動かす。
 * サーバーが無い GitHub Pages でも60秒プレイ・採点・リトライが完結する。
 *
 * ロジックは src/game.js と揃えてある（スコア式・タイマー停止・偏り防止）。
 */

import { explainWrongChoice } from './explain.js';

/** 速度ボーナス。残り時間の割合に比例 */
export function speedBonus(remainingMs, limitMs, max) {
  if (!Number.isFinite(limitMs) || limitMs <= 0) return 0;
  if (!Number.isFinite(remainingMs)) return 0;
  const ratio = Math.min(Math.max(remainingMs / limitMs, 0), 1);
  return Math.round(max * ratio);
}

/** ストリークボーナス */
export function streakBonus(streakBefore, step, max) {
  if (!Number.isFinite(streakBefore)) return 0;
  return Math.min(Math.max(0, Math.floor(streakBefore)) * step, max);
}

/** 1問ぶんの得点内訳 */
export function scoreForAnswer({ outcome, remainingMs, limitMs, streakBefore, config }) {
  if (outcome !== 'correct') return { base: 0, speed: 0, streak: 0, total: 0 };
  const base = config.basePoints;
  const speed = speedBonus(remainingMs, limitMs, config.speedBonusMax);
  const streak = streakBonus(streakBefore, config.streakStep, config.streakBonusMax);
  return { base, speed, streak, total: base + speed + streak };
}

/** いま答えたら何点か */
export function potentialScore(remainingMs, limitMs, streak, config) {
  return scoreForAnswer({ outcome: 'correct', remainingMs, limitMs, streakBefore: streak, config });
}

function shuffle(items, rng) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** 出題キュー（#10 偏り防止） */
export function buildQueue(bank, rng, { recentIds = [] } = {}) {
  const recent = new Set(recentIds);
  const fresh = bank.filter((q) => !recent.has(q.id));
  const stale = bank.filter((q) => recent.has(q.id));
  const ordered = [...shuffle(fresh, rng), ...shuffle(stale, rng)];

  const result = [];
  const remaining = [...ordered];
  let lastDataset = null;
  while (remaining.length > 0) {
    let index = remaining.findIndex((q) => q.datasetId !== lastDataset);
    if (index < 0) index = 0;
    const [picked] = remaining.splice(index, 1);
    result.push(picked);
    lastDataset = picked.datasetId;
  }
  return result;
}

function buildChoices(question, rng) {
  return shuffle([question.correct, ...question.distractors], rng).map((c) => ({
    id: c.id,
    label: c.label,
  }));
}

/**
 * ゲームを作る。サーバー版と同じ状態機械。
 */
export function createGame({ bank, mode, questionSeconds, config, rng = Math.random, now = () => Date.now(), recentIds = [] }) {
  if (!Array.isArray(bank) || bank.length === 0) throw new Error('問題データが空です');

  const limitSeconds = questionSeconds ?? 5;

  const state = {
    status: 'idle',
    mode,
    score: 0,
    correct: 0,
    misses: 0,
    streak: 0,
    maxStreak: 0,
    answered: 0,
    startedAt: 0,
    endsAt: 0,
    question: null,
    choices: [],
    questionDeadline: 0,
    questionLimitMs: limitSeconds * 1000,
    phase: 'answering',
    reveal: null,
    queue: [],
    queueIndex: 0,
    lastEvent: null,
    revealStartedAt: null,
    pausedMs: 0,
    seenIds: [],
    byCategory: {},
  };

  function remainingQuestionMs() {
    if (state.phase !== 'answering') return 0;
    return Math.max(0, state.questionDeadline - now());
  }

  function remainingSessionMs() {
    if (state.status === 'idle') return config.timeAttackSeconds * 1000;
    const reference = state.phase === 'revealed' && state.revealStartedAt !== null
      ? state.revealStartedAt
      : now();
    return Math.max(0, state.endsAt - reference);
  }

  function nextQuestion() {
    if (state.queueIndex >= state.queue.length) {
      state.queue = buildQueue(bank, rng, { recentIds: state.seenIds.slice(-10) });
      state.queueIndex = 0;
    }
    const question = state.queue[state.queueIndex];
    state.queueIndex += 1;
    state.question = question;
    state.choices = buildChoices(question, rng);
    state.questionDeadline = now() + state.questionLimitMs;
    state.phase = 'answering';
    state.reveal = null;
    state.revealStartedAt = null;
    state.seenIds.push(question.id);
    return question;
  }

  function finish() {
    state.status = 'over';
    state.phase = 'over';
    state.lastEvent = { type: 'finish' };
  }

  /** 正誤表示中はセッションを終了させない（#7） */
  function expireIfNeeded() {
    if (state.status !== 'playing') return false;
    if (state.phase === 'revealed') return false;
    if (now() >= state.endsAt) {
      finish();
      return true;
    }
    return false;
  }

  function start() {
    state.status = 'playing';
    state.score = 0;
    state.correct = 0;
    state.misses = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.answered = 0;
    state.startedAt = now();
    state.endsAt = state.startedAt + config.timeAttackSeconds * 1000;
    state.questionLimitMs = limitSeconds * 1000;
    state.queue = buildQueue(bank, rng, { recentIds });
    state.queueIndex = 0;
    state.seenIds = [];
    state.byCategory = {};
    state.pausedMs = 0;
    state.lastEvent = { type: 'start' };
    nextQuestion();
    return view();
  }

  function enterReveal(reveal) {
    state.phase = 'revealed';
    state.reveal = reveal;
    state.revealStartedAt = now();
  }

  /**
   * 誤答の詳細（#23）。
   * 選んだ選択肢だとどの結果になったかを、正解との差分つきで返す。
   * 結果はビルド時に求めたものをそのまま使う（ブラウザでSQLを実行しない）。
   */
  function buildWrongDetail(question, choiceId) {
    const preview = question.distractorPreviews?.[choiceId];
    if (!preview) return null;
    return {
      reason: explainWrongChoice(question, choiceId),
      rows: preview.rows,
      /** 集計は選択肢ごとに列が違う */
      columns: preview.columns ?? null,
      extra: preview.extra ?? [],
      missing: preview.missing ?? [],
    };
  }

  /** 停止していた時間だけセッション終了時刻を延ばす（#7） */
  function leaveReveal() {
    if (state.revealStartedAt === null) return;
    const paused = now() - state.revealStartedAt;
    state.pausedMs += paused;
    state.endsAt += paused;
    state.revealStartedAt = null;
  }

  function answer(choiceId) {
    if (state.status !== 'playing' || state.phase !== 'answering') return view();
    if (expireIfNeeded()) return view();

    const question = state.question;
    const remainingMs = remainingQuestionMs();
    if (remainingMs <= 0) return timeout();

    const isCorrect = choiceId === question.correct.id;
    const outcome = isCorrect ? 'correct' : 'incorrect';
    const gained = scoreForAnswer({
      outcome,
      remainingMs,
      limitMs: state.questionLimitMs,
      streakBefore: state.streak,
      config,
    });

    state.score += gained.total;
    state.answered += 1;
    if (isCorrect) {
      state.correct += 1;
      state.streak += 1;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
    } else {
      state.misses += 1;
      state.streak = 0;
    }

    const category = question.category ?? 'Filter';
    state.byCategory[category] ??= { correct: 0, total: 0 };
    state.byCategory[category].total += 1;
    if (isCorrect) state.byCategory[category].correct += 1;

    enterReveal({
      outcome,
      selectedId: choiceId,
      correctId: question.correct.id,
      gained,
      explanation: question.explanation,
      /** 誤答時だけ、その選択肢だとどうなったかを見せる（#23） */
      wrongDetail: isCorrect ? null : buildWrongDetail(question, choiceId),
    });
    state.lastEvent = { type: 'answer', outcome, gained };
    expireIfNeeded();
    return view();
  }

  function timeout() {
    if (state.status !== 'playing' || state.phase !== 'answering') return view();
    const question = state.question;
    state.answered += 1;
    state.misses += 1;
    state.streak = 0;

    const category = question.category ?? 'Filter';
    state.byCategory[category] ??= { correct: 0, total: 0 };
    state.byCategory[category].total += 1;

    enterReveal({
      outcome: 'timeout',
      selectedId: null,
      correctId: question.correct.id,
      gained: { base: 0, speed: 0, streak: 0, total: 0 },
      explanation: question.explanation,
    });
    state.lastEvent = { type: 'timeout' };
    expireIfNeeded();
    return view();
  }

  function next() {
    if (state.status !== 'playing' || state.phase !== 'revealed') return view();
    leaveReveal();
    if (expireIfNeeded()) return view();
    nextQuestion();
    return view();
  }

  function tick() {
    if (state.status !== 'playing') return view();
    if (expireIfNeeded()) return view();
    if (state.phase === 'answering' && remainingQuestionMs() <= 0) return timeout();
    return view();
  }

  function view() {
    expireIfNeeded();
    const question = state.question;
    const limitMs = state.questionLimitMs;
    const remainingMs = remainingQuestionMs();

    return {
      status: state.status,
      phase: state.phase,
      mode: state.mode,
      score: state.score,
      correct: state.correct,
      misses: state.misses,
      streak: state.streak,
      maxStreak: state.maxStreak,
      answered: state.answered,
      remainingSessionMs: remainingSessionMs(),
      sessionMs: config.timeAttackSeconds * 1000,
      questionLimitMs: limitMs,
      remainingQuestionMs: remainingMs,
      potential: potentialScore(remainingMs, limitMs, state.streak, config),
      question: question
        ? {
            id: question.id,
            title: question.title,
            mode: question.mode,
            category: question.category,
            columns: question.columns,
            beforeColumns: question.beforeColumns ?? question.columns,
            before: question.before,
            after: question.after,
            diff: question.diff,
            /** 段の数だけを渡す（段の中身は答えになるので渡さない） */
            stageCount: question.stageCount ?? 0,
            showBefore: question.showBefore ?? true,
          }
        : null,
      choices: state.choices,
      reveal: state.reveal,
      byCategory: state.byCategory,
      lastEvent: state.lastEvent,
    };
  }

  return { start, answer, next, tick, view, timeout, mode };
}
