/**
 * コアループ（Issue #3）。
 *
 * 出題 → 4択回答 → タイマー停止で1行解説 → 次へ、を60秒続ける。
 *
 *  - 問題は常時1問だけ
 *  - 制限時間は1問5秒が既定（3／5／8秒から選べる）
 *  - 正誤表示中はタイマーが止まる。解説は1行だけ
 *  - 正解でも不正解でも「次へ」で進む。ミスでゲームは止まらない
 *  - スコア＝基本100＋速度ボーナス0〜100＋ストリークボーナス0〜100（最大300／問）
 *  - 不正解・時間切れは0点でストリークがリセットされる（進行は止めない）
 */
import { CONFIG } from './config.js';

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

/** 問題の並びを作る。同じ問題が続かないようにシャッフルする */
function shuffle(items, rng) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** 選択肢の並びをシャッフルする（正解位置は固定しない） */
function buildChoices(question, rng) {
  const choices = shuffle([question.correct, ...question.distractors], rng);
  return choices.map((candidate) => ({ id: candidate.id, label: candidate.label }));
}

export function createGame({
  bank,
  config = CONFIG,
  rng = Math.random,
  now = () => Date.now(),
  questionSeconds = CONFIG.defaultQuestionSeconds,
}) {
  if (!Array.isArray(bank) || bank.length === 0) {
    throw new Error('問題データが空です');
  }

  const state = {
    status: 'idle',
    score: 0,
    correct: 0,
    misses: 0,
    streak: 0,
    maxStreak: 0,
    answered: 0,
    startedAt: 0,
    endsAt: 0,
    /** 現在の問題 */
    question: null,
    choices: [],
    /** 現在の問題の締切（performance.now相当） */
    questionDeadline: 0,
    questionLimitMs: questionSeconds * 1000,
    /** answering / revealed / over */
    phase: 'answering',
    /** 直前の回答結果（revealed中だけ入る） */
    reveal: null,
    /** 出題済みの問題ID（尽きたら先頭へ戻る） */
    queue: [],
    queueIndex: 0,
    lastEvent: null,
  };

  function questionLimitMs() {
    return state.questionLimitMs;
  }

  function remainingQuestionMs() {
    if (state.phase !== 'answering') return 0;
    return Math.max(0, state.questionDeadline - now());
  }

  function remainingSessionMs() {
    if (state.status === 'idle') return config.timeAttackSeconds * 1000;
    return Math.max(0, state.endsAt - now());
  }

  /** 次の問題を取り出す。尽きたら先頭へ戻る（タイムアタックは60秒続ける） */
  function nextQuestion() {
    if (state.queueIndex >= state.queue.length) {
      state.queue = shuffle(bank, rng);
      state.queueIndex = 0;
    }
    const question = state.queue[state.queueIndex];
    state.queueIndex += 1;
    state.question = question;
    state.choices = buildChoices(question, rng);
    state.questionDeadline = now() + state.questionLimitMs;
    state.phase = 'answering';
    state.reveal = null;
    return question;
  }

  function finish() {
    state.status = 'over';
    state.phase = 'over';
    state.lastEvent = { type: 'finish' };
  }

  /** セッション全体の時間切れを反映する */
  function expireIfNeeded() {
    if (state.status === 'playing' && now() >= state.endsAt) {
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
    state.questionLimitMs = questionSeconds * 1000;
    state.queue = shuffle(bank, rng);
    state.queueIndex = 0;
    state.lastEvent = { type: 'start' };
    nextQuestion();
    return view();
  }

  /**
   * 回答する。正解でも不正解でも止まらず、正誤表示（revealed）へ移る。
   * 締切を過ぎていたら時間切れとして扱う。
   */
  function answer(choiceId) {
    if (state.status !== 'playing' || state.phase !== 'answering') return view();
    if (expireIfNeeded()) return view();

    const question = state.question;
    const remainingMs = remainingQuestionMs();

    // 締切を過ぎてからの入力は時間切れ（回答とタイマーの競合で二重集計しない）
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

    state.phase = 'revealed';
    state.reveal = {
      outcome,
      selectedId: choiceId,
      correctId: question.correct.id,
      gained,
      explanation: question.explanation,
    };
    state.lastEvent = { type: 'answer', outcome, gained };

    expireIfNeeded();
    return view();
  }

  /** 時間切れ。0点でストリークがリセットされる */
  function timeout() {
    if (state.status !== 'playing' || state.phase !== 'answering') return view();
    const question = state.question;
    state.answered += 1;
    state.misses += 1;
    state.streak = 0;
    state.phase = 'revealed';
    state.reveal = {
      outcome: 'timeout',
      selectedId: null,
      correctId: question.correct.id,
      gained: { base: 0, speed: 0, streak: 0, total: 0 },
      explanation: question.explanation,
    };
    state.lastEvent = { type: 'timeout' };
    expireIfNeeded();
    return view();
  }

  /** 次の問題へ。正誤表示中だけ受け付ける */
  function next() {
    if (state.status !== 'playing' || state.phase !== 'revealed') return view();
    if (expireIfNeeded()) return view();
    nextQuestion();
    return view();
  }

  /** 経過時間を反映する（時間切れ判定と自動進行） */
  function tick() {
    if (state.status !== 'playing') return view();
    if (expireIfNeeded()) return view();
    if (state.phase === 'answering' && remainingQuestionMs() <= 0) return timeout();
    return view();
  }

  /** クライアントへ返すスナップショット */
  function view() {
    expireIfNeeded();
    const question = state.question;
    const limitMs = state.questionLimitMs;
    const remainingMs = remainingQuestionMs();

    return {
      status: state.status,
      phase: state.phase,
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
      /** いま正解したら何点か（スコア減衰のライブ表示） */
      potential: potentialScore(remainingMs, limitMs, state.streak),
      question: question
        ? {
            id: question.id,
            title: question.title,
            columns: question.columns,
            before: question.before,
            after: question.after,
            diff: question.diff,
          }
        : null,
      choices: state.choices,
      reveal: state.reveal,
      lastEvent: state.lastEvent,
    };
  }

  return { start, answer, next, tick, view, timeout };
}
