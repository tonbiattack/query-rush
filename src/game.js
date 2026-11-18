/**
 * コアループ（Issue #3 / #7 / #9 / #10 / #12 / #16）。
 *
 * 出題 → 4択回答 → タイマー停止で1行解説 → 次へ、を60秒続ける。
 *
 *  - 問題は常時1問だけ
 *  - 制限時間はモードごと（Filter 5秒 / Advanced 8秒 / Pipeline 15秒 など）
 *  - **正誤表示中は60秒タイマーも1問タイマーも止まる**（#7）
 *  - 正解でも不正解でも「次へ」で進む。ミスでゲームは止まらない
 *  - スコア＝基本100＋速度ボーナス0〜100＋ストリークボーナス0〜100（最大300／問）
 *  - 不正解・時間切れは0点でストリークがリセットされる（進行は止めない）
 *  - 同じデータセット・同じ罠の連続出題を抑制する（#10）
 */
import { CONFIG } from './config.js';
import { MODES, modeOf } from './modes.js';
import { explainWrongChoice } from './questions.js';

/** 速度ボーナス。残り時間の割合に比例して0〜speedBonusMax */
export function speedBonus(remainingMs, limitMs) {
  if (!Number.isFinite(limitMs) || limitMs <= 0) return 0;
  if (!Number.isFinite(remainingMs)) return 0;
  const ratio = Math.min(Math.max(remainingMs / limitMs, 0), 1);
  return Math.round(CONFIG.speedBonusMax * ratio);
}

/** ストリークボーナス。直前までの連続正解数に応じて0〜streakBonusMax */
export function streakBonus(streakBefore) {
  if (!Number.isFinite(streakBefore)) return 0;
  const streak = Math.max(0, Math.floor(streakBefore));
  return Math.min(streak * CONFIG.streakStep, CONFIG.streakBonusMax);
}

/** 1問ぶんの得点内訳。正解以外はすべて0点 */
export function scoreForAnswer({ outcome, remainingMs, limitMs, streakBefore }) {
  if (outcome !== 'correct') return { base: 0, speed: 0, streak: 0, total: 0 };
  const base = CONFIG.basePoints;
  const speed = speedBonus(remainingMs, limitMs);
  const streak = streakBonus(streakBefore);
  return { base, speed, streak, total: base + speed + streak };
}

/** いま答えたら何点になるかの見込み（出題中のライブ表示に使う） */
export function potentialScore(remainingMs, limitMs, streak) {
  return scoreForAnswer({ outcome: 'correct', remainingMs, limitMs, streakBefore: streak });
}

/** シャッフル */
function shuffle(items, rng) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * 出題キューを作る（#10 偏り防止）。
 *
 *  - 同じデータセットが連続しない（可能な限り）
 *  - 直前セッションで出た問題を先頭に置かない
 *  - 正解位置が偏らないよう、選択肢の並びは毎回シャッフルする
 *
 * データセットごとの問題数に偏りがあると、最後に同データセットだけが
 * 残って連続することがある。その場合は「直前と違うデータセット」を
 * 優先して選び、どうしても無理なときだけ連続を許す。
 */
export function buildQueue(bank, rng, { recentIds = [] } = {}) {
  const recent = new Set(recentIds);
  const fresh = bank.filter((q) => !recent.has(q.id));
  const stale = bank.filter((q) => recent.has(q.id));
  const ordered = [...shuffle(fresh, rng), ...shuffle(stale, rng)];

  const result = [];
  const remaining = [...ordered];
  let lastDataset = null;

  while (remaining.length > 0) {
    // 直前と違うデータセットを優先する
    let index = remaining.findIndex((q) => q.datasetId !== lastDataset);
    if (index < 0) {
      // 同データセットしか残っていない → 残りの中で最も件数の少ないものから選ぶ
      index = 0;
    }
    const [picked] = remaining.splice(index, 1);
    result.push(picked);
    lastDataset = picked.datasetId;
  }
  return result;
}

/** 選択肢の並びをシャッフルする（正解位置は固定しない） */
function buildChoices(question, rng) {
  const choices = shuffle([question.correct, ...question.distractors], rng);
  return choices.map((candidate) => ({ id: candidate.id, label: candidate.label }));
}

export function createGame({
  bank,
  mode = 'filter',
  config = CONFIG,
  rng = Math.random,
  now = () => Date.now(),
  questionSeconds,
  recentIds = [],
}) {
  if (!Array.isArray(bank) || bank.length === 0) {
    throw new Error('問題データが空です');
  }

  const modeDef = modeOf(mode);
  const limitSeconds = questionSeconds ?? modeDef.questionSeconds;

  const state = {
    status: 'idle',
    mode: modeDef.id,
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
    /** 正誤表示に入った時刻（#7 タイマー停止の計算に使う） */
    revealStartedAt: null,
    /** 停止した累積時間（#7） */
    pausedMs: 0,
    /** 出題済みの問題ID（#10 偏り防止） */
    seenIds: [],
    /** カテゴリ別の正誤（#16 結果画面） */
    byCategory: {},
  };

  function remainingQuestionMs() {
    if (state.phase !== 'answering') return 0;
    return Math.max(0, state.questionDeadline - now());
  }

  /**
   * セッション全体の残り時間。
   * 正誤表示中はタイマーが止まっているので、停止開始時刻を基準にする（#7）。
   */
  function remainingSessionMs() {
    if (state.status === 'idle') return config.timeAttackSeconds * 1000;
    const reference = state.phase === 'revealed' && state.revealStartedAt !== null
      ? state.revealStartedAt
      : now();
    return Math.max(0, state.endsAt - reference);
  }

  /** 次の問題を取り出す。尽きたら先頭へ戻る */
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

  /**
   * セッション全体の時間切れを反映する。
   * 正誤表示中（revealed）はタイマーが止まっているので終了させない（#7）。
   */
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

  /** 正誤表示に入る。ここでタイマーが止まる（#7） */
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

  /**
   * 正誤表示を抜ける。停止していた時間だけセッション終了時刻を延ばす（#7）。
   * これにより「正誤表示中に10秒待っても残り時間が減らない」が成立する。
   */
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

    // カテゴリ別の記録（#16）
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

  /** 次の問題へ。正誤表示中だけ受け付ける */
  function next() {
    if (state.status !== 'playing' || state.phase !== 'revealed') return view();
    leaveReveal();
    if (expireIfNeeded()) return view();
    nextQuestion();
    return view();
  }

  /** 経過時間を反映する */
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
      modeName: modeDef.name,
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
      potential: potentialScore(remainingMs, limitMs, state.streak),
      question: question
        ? {
            id: question.id,
            title: question.title,
            mode: question.mode,
            category: question.category,
            columns: question.columns,
            /** 集計モードは「元の行」の列が集計後と違う */
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

  return { start, answer, next, tick, view, timeout, mode: modeDef.id };
}
