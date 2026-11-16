/**
 * コアループ（Issue #3）。
 *
 *  - 注文は常時1件だけ提示する
 *  - 結果が完成形と完全一致したときだけ「提供」でき、次の注文へ進む
 *  - 不一致・不正な組み合わせはミスでコンボがリセットされる
 *  - 60秒タイマーで時間切れになるとスコアが確定する
 *  - スコア＝基本点 × コンボ倍率 ＋ 残り時間ボーナス
 */
import { CONFIG } from './config.js';
import { ORDERS } from './orders.js';
import { CHIP_BY_ID, emptyPlacement, normalizePlacement } from './chips.js';

/** コンボ倍率。ミスせず捌くほど伸びる（速さより正確さが伸びる配分） */
export function comboMultiplier(combo) {
  return Math.min(1 + CONFIG.comboStep * combo, CONFIG.comboMaxMultiplier);
}

/** 1件提供したときの得点内訳 */
export function scoreForServe({ combo, elapsedSeconds }) {
  const multiplier = comboMultiplier(combo);
  const base = Math.round(CONFIG.basePoints * multiplier);
  const timeBonus = Math.max(
    0,
    Math.round((CONFIG.timeBonusWindowSeconds - elapsedSeconds) * CONFIG.timeBonusPerSecond),
  );
  return { base, multiplier, timeBonus, total: base + timeBonus };
}

/** 列・行・順序・値を含む完全一致。注文検証でも同じ判定を使う。 */
export function resultsMatch(result, target) {
  if (result.error || result.overBudget || result.truncated || target.error || target.overBudget || target.truncated) return false;
  if (result.columns.length !== target.columns.length ||
      result.columns.some((column, index) => column !== target.columns[index])) return false;
  return result.rows.length === target.rows.length && result.rows.every((row, index) =>
    result.columns.every((column) => row[column] === target.rows[index][column]));
}

/** 注文の並びを作る。直前と同じ注文が続かないようにする */
function buildQueue(rng) {
  const pool = [...ORDERS];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function createGame({ engine, config = CONFIG, rng = Math.random, now = () => Date.now() }) {
  const allRows = engine.allRows();
  const targetCache = new Map();

  /** 完成形は必ずエンジンで実行して作る（注文票の文面と結果がずれない） */
  function targetFor(order) {
    if (!targetCache.has(order.id)) {
      const result = engine.run(order.answer);
      if (result.error || result.overBudget || result.truncated) {
        throw new Error(`注文 ${order.id} の完成形を取得できません`);
      }
      targetCache.set(order.id, {
        columns: result.columns,
        rows: result.rows,
        sql: result.sql,
        displayColumns: displayColumnsFor(order, result),
      });
    }
    return targetCache.get(order.id);
  }

  /**
   * 完成形プレビューに出す列。
   * 全列を出すと横に溢れて読みにくいので、判定に効く列だけに絞る。
   *  - 集計: category / 件数 / 売上
   *  - 通常: item ＋ 並び替えに使った列
   */
  function displayColumnsFor(order, result) {
    if (result.key === 'category') return result.columns;
    const columns = ['item'];
    const orderBy = order.answer.orderBy;
    if (orderBy) {
      const column = CHIP_BY_ID.get(orderBy).sql.split(/\s+/)[0];
      if (result.columns.includes(column)) columns.push(column);
    }
    return columns;
  }

  const state = {
    status: 'idle',
    score: 0,
    combo: 0,
    maxCombo: 0,
    misses: 0,
    served: 0,
    startedAt: 0,
    endsAt: 0,
    orderIndex: 0,
    orderStartedAt: 0,
    queue: [],
    placement: emptyPlacement(),
    result: null,
    lastEvent: null,
  };

  function currentOrder() {
    return state.queue[state.orderIndex % state.queue.length];
  }

  function remainingMs() {
    if (state.status === 'idle') return config.sprintSeconds * 1000;
    return Math.max(0, state.endsAt - now());
  }

  function expireIfNeeded() {
    if (state.status === 'playing' && now() >= state.endsAt) {
      state.status = 'over';
      state.lastEvent = { type: 'timeup' };
      return true;
    }
    return false;
  }

  /** 現在の配置でクエリを実行し、state.result を更新する */
  function refresh() {
    // 行と集計グループは別のキー空間なので、切り替え時は差分をリセットする。
    const nextKey = state.placement.groupBy ? 'category' : 'id';
    const prevRows = state.result?.key === nextKey ? state.result.rows : [];
    state.result = engine.run(state.placement, prevRows);
    return state.result;
  }

  function start() {
    state.status = 'playing';
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.misses = 0;
    state.served = 0;
    state.startedAt = now();
    state.endsAt = state.startedAt + config.sprintSeconds * 1000;
    state.orderIndex = 0;
    state.orderStartedAt = state.startedAt;
    state.queue = buildQueue(rng);
    state.placement = emptyPlacement();
    state.result = null;
    state.lastEvent = { type: 'start' };
    refresh();
    return view();
  }

  /** チップを置く／外す。同じチップをもう一度押すと外れる */
  function toggleChip(chipId) {
    if (state.status !== 'playing') return view();
    if (expireIfNeeded()) return view();

    const p = normalizePlacement(state.placement);
    const chip = CHIP_BY_ID.get(chipId);
    if (!chip) {
      state.combo = 0;
      state.misses += 1;
      state.lastEvent = { type: 'miss', reason: 'invalid', message: '不明なチップです' };
      return view();
    }
    if (p.where.includes(chipId)) {
      p.where = p.where.filter((id) => id !== chipId);
    } else if (p.groupBy === chipId) {
      p.groupBy = null;
    } else if (p.orderBy === chipId) {
      p.orderBy = null;
    } else if (p.limit === chipId) {
      p.limit = null;
    } else {
      // スロットごとの定員は1枚（WHEREだけ複数可）
      if (chip.slot === 'where') p.where.push(chipId);
      else p[chip.slot] = chipId;
    }

    state.placement = normalizePlacement(p);
    state.lastEvent = { type: 'place', chipId };
    refresh();
    return view();
  }

  /** 配置を空に戻す */
  function clearPlacement() {
    if (state.status !== 'playing' || expireIfNeeded()) return view();
    state.placement = emptyPlacement();
    state.lastEvent = { type: 'clear' };
    refresh();
    return view();
  }

  /** 提供判定。結果が完成形と完全一致したときだけ通る */
  function serve() {
    if (state.status !== 'playing') return view();
    if (expireIfNeeded()) return view();

    const order = currentOrder();
    const target = targetFor(order);
    const result = state.result ?? refresh();

    const matched = resultsMatch(result, target);
    const elapsedSeconds = (now() - state.orderStartedAt) / 1000;

    if (matched) {
      const gained = scoreForServe({ combo: state.combo, elapsedSeconds });
      state.score += gained.total;
      state.combo += 1;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.served += 1;
      state.lastEvent = { type: 'served', gained, orderId: order.id };

      state.orderIndex += 1;
      state.orderStartedAt = now();
      state.placement = emptyPlacement();
      state.result = null;
      refresh();
    } else {
      state.combo = 0;
      state.misses += 1;
      state.lastEvent = {
        type: 'miss',
        reason: result.error ? 'invalid' : 'mismatch',
        message: result.error ?? null,
      };
    }

    expireIfNeeded();
    return view();
  }

  /** クライアントへ返すスナップショット */
  function view() {
    expireIfNeeded();
    const order = state.queue.length > 0 ? currentOrder() : ORDERS[0];
    const target = targetFor(order);

    return {
      status: state.status,
      remainingMs: remainingMs(),
      sprintMs: config.sprintSeconds * 1000,
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      misses: state.misses,
      served: state.served,
      comboMultiplier: comboMultiplier(state.combo),
      order: {
        id: order.id,
        ticket: order.ticket,
        difficulty: order.difficulty,
        hint: order.hint ?? null,
        trap: order.trap ?? null,
        target: {
          columns: target.displayColumns,
          rows: target.rows,
          allColumns: target.columns,
        },
      },
      placement: state.placement,
      sql: state.result?.sql ?? '',
      result: state.result
        ? {
            columns: state.result.columns,
            rows: state.result.rows,
            key: state.result.key,
            diff: state.result.diff,
            highlight: state.result.highlight,
            error: state.result.error,
            overBudget: state.result.overBudget,
            truncated: state.result.truncated,
            durationMs: state.result.durationMs,
          }
        : null,
      lastEvent: state.lastEvent,
    };
  }

  return { start, toggleChip, clearPlacement, serve, view, allRows, currentOrder };
}
