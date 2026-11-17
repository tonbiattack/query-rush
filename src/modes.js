/**
 * モード定義（Issue #9 / #12 / #13 / #14 / #15 / #16）。
 *
 * 各モードは「どんな問題を出すか」と「どう見せるか」を持つ。
 * 問題生成の共通部分は questions.js が担い、モードは素材と表示だけを決める。
 *
 * スコアはモードごとに分離する（難度間の直接比較をしない。#12 共通原則）。
 */

/** モードの種類 */
export const MODES = {
  filter: {
    id: 'filter',
    name: 'Filter Rush',
    short: 'Filter',
    description: 'WHERE で行がどう絞られるかを見る',
    /** 1問の制限時間（秒） */
    questionSeconds: 5,
    /** 出題形式 */
    kind: 'filter',
    /** 結果画面で使う色 */
    tone: 'wasabi',
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    short: 'Advanced',
    description: 'AND / OR / IN / BETWEEN / LIKE / NULL の三値論理',
    questionSeconds: 8,
    kind: 'filter',
    tone: 'ochre',
  },
  logic: {
    id: 'logic',
    name: 'Logic Rush',
    short: 'Logic',
    description: 'CASE / COALESCE / NULLIF / EXISTS の評価結果',
    questionSeconds: 8,
    kind: 'logic',
    tone: 'plum',
  },
  aggregate: {
    id: 'aggregate',
    name: 'Aggregate Rush',
    short: 'Aggregate',
    description: 'GROUP BY / HAVING / 集計関数の結果',
    questionSeconds: 8,
    kind: 'aggregate',
    tone: 'maguro',
  },
  pipeline: {
    id: 'pipeline',
    name: 'Pipeline Rush',
    short: 'Pipeline',
    description: 'CTE / JOIN を段階的に追う',
    questionSeconds: 15,
    kind: 'pipeline',
    tone: 'shari',
  },
  master: {
    id: 'master',
    name: 'Master Rush',
    short: 'Master',
    description: '全カテゴリ混合',
    questionSeconds: 8,
    kind: 'mixed',
    tone: 'ochre',
  },
};

/** モードの並び（開始画面の表示順） */
export const MODE_ORDER = ['filter', 'advanced', 'logic', 'aggregate', 'pipeline', 'master'];

/** 既定モード */
export const DEFAULT_MODE = 'filter';

/** モードIDとして妥当か */
export function isModeId(value) {
  return typeof value === 'string' && Object.hasOwn(MODES, value);
}

/** モードを取得する（不明なら既定） */
export function modeOf(value) {
  return isModeId(value) ? MODES[value] : MODES[DEFAULT_MODE];
}

/** 開始画面用の一覧 */
export function modeList() {
  return MODE_ORDER.map((id) => MODES[id]);
}
