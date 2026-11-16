/**
 * 句チップの定義。
 *
 * 設計上の絶対条件（docs/SPEC.md）:
 *  - チップの配置は固定。SHELF_LAYOUT の並びをプレイ中にシャッフルしない
 *  - 同時表示チップは最大8枚
 *
 * slot はクエリのどこに入るかを表す。
 *  - where   : 複数枚を AND で積める
 *  - groupBy : 1枚だけ
 *  - orderBy : 1枚だけ
 *  - limit   : 1枚だけ
 */
export const CHIPS = [
  { id: 'w_price', slot: 'where', label: 'price > 1000', sql: 'price > 1000', tone: 'moss' },
  { id: 'w_list', slot: 'where', label: 'list_price > 1000', sql: 'list_price > 1000', tone: 'moss' },
  { id: 'w_returned', slot: 'where', label: "status != 'returned'", sql: "status != 'returned'", tone: 'moss' },
  { id: 'w_stock', slot: 'where', label: 'stock > 0', sql: 'stock > 0', tone: 'moss' },
  { id: 'g_category', slot: 'groupBy', label: 'GROUP BY category', sql: 'category', tone: 'plum' },
  { id: 'o_sales', slot: 'orderBy', label: 'ORDER BY sales DESC', sql: 'sales DESC', tone: 'crimson' },
  { id: 'o_count', slot: 'orderBy', label: 'ORDER BY sales_count DESC', sql: 'sales_count DESC', tone: 'crimson' },
  { id: 'l_3', slot: 'limit', label: 'LIMIT 3', sql: '3', tone: 'ochre' },
];

/** 棚の並び。この順序をプレイ中に変えない（探す時間をゼロにする） */
export const SHELF_LAYOUT = CHIPS.map((c) => c.id);

export const CHIP_BY_ID = new Map(CHIPS.map((c) => [c.id, c]));

/** 空の配置 */
export function emptyPlacement() {
  return { where: [], groupBy: null, orderBy: null, limit: null };
}

/** 配置を正規化する（不正なID・スロット違いを落とす） */
export function normalizePlacement(raw) {
  const out = emptyPlacement();
  if (!raw || typeof raw !== 'object') return out;

  const where = Array.isArray(raw.where) ? raw.where : [];
  for (const id of where) {
    const chip = CHIP_BY_ID.get(id);
    if (chip && chip.slot === 'where' && !out.where.includes(id)) out.where.push(id);
  }
  // 棚の並び順に揃える（同じ集合なら常に同じSQLになる）
  out.where.sort((a, b) => SHELF_LAYOUT.indexOf(a) - SHELF_LAYOUT.indexOf(b));

  for (const slot of ['groupBy', 'orderBy', 'limit']) {
    const chip = CHIP_BY_ID.get(raw[slot]);
    if (chip && chip.slot === slot) out[slot] = chip.id;
  }
  return out;
}
