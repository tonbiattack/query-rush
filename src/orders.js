/**
 * 注文の定義。
 *
 * answer は「棚のチップだけで到達できる完成形」。
 * 完成形の結果プレビューは answer から実際にクエリを実行して作るので、
 * 注文票の文面と完成形がずれることはない（Issue #4 の受け入れ条件）。
 *
 * difficulty は罠の密度。1 = 罠なし、2 = 似た列名、3 = NULL と重複も絡む。
 *
 * 各注文は scripts/check-orders.js の検証を通ること:
 *  - 解ける       … 完成形のクエリがエラーにならず1行以上返す
 *  - 一意         … 完成形と同じ結果になる別の配置が存在しない
 *  - 全チップ必須 … 完成形からチップを1枚外すと結果が変わる
 *  - 罠が効く     … 同じスロットの別チップに差し替えると結果が変わる
 *  - 衝突なし     … 注文どうしの完成形が同じにならない
 */
export const ORDERS = [
  {
    id: 'o1',
    ticket: '返品は除く。売上の高い順に3件。',
    difficulty: 1,
    hint: 'チップを押すとクエリに組み込まれます。完成形と見比べて、合っていれば提供。',
    trap: null,
    answer: { where: ['w_returned'], groupBy: null, orderBy: 'o_sales', limit: 'l_3' },
  },
  {
    id: 'o2',
    ticket: '1,000円を超えるもの。売上の高い順に。',
    difficulty: 2,
    trap: 'price と list_price は別の列。定価ではなく売価で絞ります。',
    answer: { where: ['w_price'], groupBy: null, orderBy: 'o_sales', limit: null },
  },
  {
    id: 'o3',
    ticket: '在庫があるもの。販売数の多い順に。',
    difficulty: 2,
    trap: 'sales は売上金額、sales_count は販売数。並べる列を取り違えないこと。',
    answer: { where: ['w_stock'], groupBy: null, orderBy: 'o_count', limit: null },
  },
  {
    id: 'o4',
    ticket: '返品は除く。1,000円を超えるもの。売上の高い順に。',
    difficulty: 2,
    trap: '条件は2つ。WHERE は AND で積み重なります。',
    answer: { where: ['w_returned', 'w_price'], groupBy: null, orderBy: 'o_sales', limit: null },
  },
  {
    id: 'o5',
    ticket: '返品は除く。カテゴリごとの売上合計。売上の高い順に。',
    difficulty: 3,
    trap: 'GROUP BY を置くと行がカテゴリに畳まれます。WHERE は畳む前に効きます。',
    answer: { where: ['w_returned'], groupBy: 'g_category', orderBy: 'o_sales', limit: null },
  },
  {
    id: 'o6',
    ticket: 'カテゴリごとの件数。件数の多い順に3件。',
    difficulty: 3,
    trap: 'GROUP BY したあとの「件数」は COUNT(*)。行数ではなくグループ数で数えます。',
    answer: { where: [], groupBy: 'g_category', orderBy: 'o_count', limit: 'l_3' },
  },
  {
    id: 'o7',
    ticket: '定価が1,000円を超えるもの。売上の高い順に。',
    difficulty: 3,
    trap: '今度は定価（list_price）で絞ります。price ではありません。',
    answer: { where: ['w_list'], groupBy: null, orderBy: 'o_sales', limit: null },
  },
  {
    id: 'o8',
    ticket: '在庫があり、返品は除く。売上の高い順に3件。',
    difficulty: 2,
    trap: 'stock が NULL の行は「在庫あり」に含まれません。',
    answer: { where: ['w_stock', 'w_returned'], groupBy: null, orderBy: 'o_sales', limit: 'l_3' },
  },
  {
    id: 'o9',
    ticket: '1,000円を超え、在庫があるもの。売上の高い順に。',
    difficulty: 3,
    trap: 'price が NULL の行は条件を満たしません。NULL は比較で弾かれます。',
    answer: { where: ['w_price', 'w_stock'], groupBy: null, orderBy: 'o_sales', limit: null },
  },
  {
    id: 'o10',
    ticket: '在庫があるもの全件。売上の高い順に。',
    difficulty: 1,
    trap: null,
    answer: { where: ['w_stock'], groupBy: null, orderBy: 'o_sales', limit: null },
  },
];
