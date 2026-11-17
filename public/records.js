/**
 * ローカル記録（Issue #11）。
 *
 * localStorage に自己ベストと直近履歴を保存する。匿名・端末内のみ。
 * 保存できない環境（プライベートモード等）や壊れたデータでも
 * 通常プレイを止めない。
 */

const STORAGE_KEY = 'query-rush:records:v1';
const HISTORY_LIMIT = 20;

/** localStorage が使えるか（例外を握りつぶして判定） */
function storage() {
  try {
    const test = '__qr_test__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 保存データを読む。壊れていれば空で返す */
export function loadRecords() {
  const store = storage();
  if (!store) return { bests: {}, history: [] };
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return { bests: {}, history: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { bests: {}, history: [] };
    return {
      bests: parsed.bests && typeof parsed.bests === 'object' ? parsed.bests : {},
      history: Array.isArray(parsed.history) ? parsed.history.filter(isValidRecord) : [],
    };
  } catch {
    return { bests: {}, history: [] };
  }
}

function isValidRecord(record) {
  return (
    record &&
    typeof record === 'object' &&
    typeof record.mode === 'string' &&
    typeof record.score === 'number' &&
    Number.isFinite(record.score)
  );
}

/** 保存する。失敗しても例外を投げない */
function saveRecords(records) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/**
 * モードごとのキー。難度と制限時間が違うスコアを混ぜない（#11 受け入れ条件）。
 */
export function recordKey(mode, questionSeconds) {
  return `${mode}:${questionSeconds}`;
}

/**
 * プレイ結果を記録する。
 * @returns {{isBest: boolean, previousBest: number|null, average: number|null, saved: boolean}}
 */
export function recordResult({ mode, questionSeconds, score, correct, misses, maxStreak, answered }) {
  const records = loadRecords();
  const key = recordKey(mode, questionSeconds);
  const previousBest = typeof records.bests[key] === 'number' ? records.bests[key] : null;
  const isBest = previousBest === null || score > previousBest;

  const sameKey = records.history.filter(
    (entry) => entry.mode === mode && entry.questionSeconds === questionSeconds,
  );
  const average = sameKey.length > 0
    ? Math.round(sameKey.reduce((sum, entry) => sum + entry.score, 0) / sameKey.length)
    : null;

  if (isBest) records.bests[key] = score;

  records.history.unshift({
    mode,
    questionSeconds,
    score,
    correct,
    misses,
    maxStreak,
    answered,
    at: Date.now(),
  });
  records.history = records.history.slice(0, HISTORY_LIMIT);

  const saved = saveRecords(records);
  return { isBest, previousBest, average, saved };
}

/** 指定モードの自己ベストを取得する */
export function bestFor(mode, questionSeconds) {
  const records = loadRecords();
  const value = records.bests[recordKey(mode, questionSeconds)];
  return typeof value === 'number' ? value : null;
}

/** 履歴を消す */
export function clearRecords() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 履歴の一覧（新しい順） */
export function history() {
  return loadRecords().history;
}
