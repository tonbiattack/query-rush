/**
 * 問題データの素材。
 *
 * 1つのデータセット＝1つの小さなテーブル（表示は最大8行）。
 * 罠はデータ側に置く（docs/SPEC.md「データ設計」）:
 *  - 似た列名: price / list_price、qty / total、age / years、qty / reorder
 *  - NULL: price・stock・member・note に混入
 *  - 重複: total が同値の行（960 が2行）
 *
 * candidates は「そのテーブルで実際に使える WHERE 候補」。
 * 正解1つ＋惜しい不正解3つをここから選ぶ（ランダムなダミーは入れない）。
 *
 * 各列ファミリー（同じ列を触る候補）は、結果がすべて異なるように作ってある。
 * そうしないと「正解が一意」な問題が成立しない。scripts/check-questions.js が検証する。
 *
 * similarColumns は「似た列名」の組。惜しい不正解を選ぶときに、
 * 同じ列に加えてこの組の列も候補にする（price と list_price の取り違え等）。
 */

export const DATASETS = [
  {
    id: 'menu',
    title: 'メニュー',
    columns: ['name', 'price', 'list_price', 'status', 'stock'],
    similarColumns: [['price', 'list_price']],
    rows: [
      { id: 1, name: 'まぐろ', price: 480, list_price: 520, status: 'served', stock: 3 },
      { id: 2, name: 'サーモン', price: 380, list_price: 420, status: 'served', stock: 5 },
      { id: 3, name: 'えび', price: 320, list_price: 360, status: 'returned', stock: 2 },
      { id: 4, name: 'たまご', price: 180, list_price: 200, status: 'served', stock: 8 },
      { id: 5, name: 'うに', price: 1200, list_price: 1400, status: 'served', stock: 1 },
      { id: 6, name: '中とろ', price: 1000, list_price: 1100, status: 'pending', stock: null },
      { id: 7, name: '大とろ', price: 1600, list_price: 1800, status: 'returned', stock: 0 },
      { id: 8, name: '穴子', price: null, list_price: 560, status: 'served', stock: 4 },
    ],
    candidates: [
      // price ファミリー
      { id: 'm_price_gt', label: 'price > 1000', sql: 'price > 1000' },
      { id: 'm_price_ge', label: 'price >= 1000', sql: 'price >= 1000' },
      { id: 'm_price_lt400', label: 'price < 400', sql: 'price < 400' },
      { id: 'm_price_lt500', label: 'price < 500', sql: 'price < 500' },
      { id: 'm_price_null', label: 'price IS NULL', sql: 'price IS NULL' },
      { id: 'm_price_not_null', label: 'price IS NOT NULL', sql: 'price IS NOT NULL' },
      // list_price ファミリー（似た列名の罠）
      { id: 'm_list_gt', label: 'list_price > 1000', sql: 'list_price > 1000' },
      { id: 'm_list_lt600', label: 'list_price < 600', sql: 'list_price < 600' },
      { id: 'm_list_gt1500', label: 'list_price > 1500', sql: 'list_price > 1500' },
      // status ファミリー
      { id: 'm_served', label: "status = 'served'", sql: "status = 'served'" },
      { id: 'm_returned', label: "status = 'returned'", sql: "status = 'returned'" },
      { id: 'm_pending', label: "status = 'pending'", sql: "status = 'pending'" },
      { id: 'm_not_returned', label: "status != 'returned'", sql: "status != 'returned'" },
      { id: 'm_not_served', label: "status != 'served'", sql: "status != 'served'" },
      { id: 'm_not_pending', label: "status != 'pending'", sql: "status != 'pending'" },
      // stock ファミリー
      { id: 'm_stock_gt', label: 'stock > 0', sql: 'stock > 0' },
      { id: 'm_stock_ge3', label: 'stock >= 3', sql: 'stock >= 3' },
      { id: 'm_stock_lt3', label: 'stock < 3', sql: 'stock < 3' },
      { id: 'm_stock_null', label: 'stock IS NULL', sql: 'stock IS NULL' },
      { id: 'm_stock_not_null', label: 'stock IS NOT NULL', sql: 'stock IS NOT NULL' },
    ],
  },
  {
    id: 'orders',
    title: '注文',
    columns: ['item', 'qty', 'total', 'status', 'member'],
    similarColumns: [['qty', 'total']],
    rows: [
      { id: 1, item: 'まぐろ', qty: 2, total: 960, status: 'paid', member: 'yes' },
      { id: 2, item: 'サーモン', qty: 1, total: 380, status: 'paid', member: 'no' },
      { id: 3, item: 'えび', qty: 3, total: 960, status: 'cancelled', member: 'yes' },
      { id: 4, item: 'たまご', qty: 5, total: 900, status: 'paid', member: 'yes' },
      { id: 5, item: 'うに', qty: 1, total: 1200, status: 'paid', member: 'no' },
      { id: 6, item: '中とろ', qty: 2, total: 2000, status: 'pending', member: 'yes' },
      { id: 7, item: '大とろ', qty: 1, total: 1600, status: 'cancelled', member: 'no' },
      { id: 8, item: '穴子', qty: 4, total: 2240, status: 'paid', member: null },
    ],
    candidates: [
      // qty ファミリー
      { id: 'o_qty_gt2', label: 'qty > 2', sql: 'qty > 2' },
      { id: 'o_qty_ge2', label: 'qty >= 2', sql: 'qty >= 2' },
      { id: 'o_qty_lt2', label: 'qty < 2', sql: 'qty < 2' },
      { id: 'o_qty_le2', label: 'qty <= 2', sql: 'qty <= 2' },
      { id: 'o_qty_gt4', label: 'qty > 4', sql: 'qty > 4' },
      // total ファミリー（似た列名の罠）
      { id: 'o_total_gt1000', label: 'total > 1000', sql: 'total > 1000' },
      { id: 'o_total_ge960', label: 'total >= 960', sql: 'total >= 960' },
      { id: 'o_total_lt1000', label: 'total < 1000', sql: 'total < 1000' },
      { id: 'o_total_gt2000', label: 'total > 2000', sql: 'total > 2000' },
      // status ファミリー
      { id: 'o_paid', label: "status = 'paid'", sql: "status = 'paid'" },
      { id: 'o_cancelled', label: "status = 'cancelled'", sql: "status = 'cancelled'" },
      { id: 'o_pending', label: "status = 'pending'", sql: "status = 'pending'" },
      { id: 'o_not_paid', label: "status != 'paid'", sql: "status != 'paid'" },
      { id: 'o_not_cancelled', label: "status != 'cancelled'", sql: "status != 'cancelled'" },
      { id: 'o_not_pending', label: "status != 'pending'", sql: "status != 'pending'" },
      // member ファミリー
      { id: 'o_member_yes', label: "member = 'yes'", sql: "member = 'yes'" },
      { id: 'o_member_no', label: "member = 'no'", sql: "member = 'no'" },
      { id: 'o_member_null', label: 'member IS NULL', sql: 'member IS NULL' },
      { id: 'o_member_not_null', label: 'member IS NOT NULL', sql: 'member IS NOT NULL' },
      { id: 'o_member_not_yes', label: "member != 'yes'", sql: "member != 'yes'" },
    ],
  },
  {
    id: 'staff',
    title: '従業員',
    columns: ['name', 'age', 'years', 'role', 'shift'],
    similarColumns: [['age', 'years']],
    rows: [
      { id: 1, name: '田中', age: 28, years: 3, role: 'chef', shift: 'morning' },
      { id: 2, name: '佐藤', age: 34, years: 8, role: 'chef', shift: 'evening' },
      { id: 3, name: '鈴木', age: 22, years: 1, role: 'helper', shift: 'night' },
      { id: 4, name: '高橋', age: 45, years: 20, role: 'manager', shift: 'morning' },
      { id: 5, name: '伊藤', age: 31, years: 5, role: 'helper', shift: 'evening' },
      { id: 6, name: '渡辺', age: 26, years: 2, role: 'chef', shift: 'night' },
      { id: 7, name: '山本', age: 52, years: 25, role: 'manager', shift: 'morning' },
      { id: 8, name: '中村', age: 39, years: 12, role: 'helper', shift: 'evening' },
    ],
    candidates: [
      // age ファミリー
      { id: 's_age_gt40', label: 'age > 40', sql: 'age > 40' },
      { id: 's_age_ge39', label: 'age >= 39', sql: 'age >= 39' },
      { id: 's_age_lt30', label: 'age < 30', sql: 'age < 30' },
      { id: 's_age_lt35', label: 'age < 35', sql: 'age < 35' },
      { id: 's_age_gt50', label: 'age > 50', sql: 'age > 50' },
      // years ファミリー（似た列名の罠）
      { id: 's_years_gt10', label: 'years > 10', sql: 'years > 10' },
      { id: 's_years_ge8', label: 'years >= 8', sql: 'years >= 8' },
      { id: 's_years_lt5', label: 'years < 5', sql: 'years < 5' },
      { id: 's_years_le5', label: 'years <= 5', sql: 'years <= 5' },
      { id: 's_years_gt20', label: 'years > 20', sql: 'years > 20' },
      // role ファミリー
      { id: 's_chef', label: "role = 'chef'", sql: "role = 'chef'" },
      { id: 's_manager', label: "role = 'manager'", sql: "role = 'manager'" },
      { id: 's_helper', label: "role = 'helper'", sql: "role = 'helper'" },
      { id: 's_not_chef', label: "role != 'chef'", sql: "role != 'chef'" },
      { id: 's_not_manager', label: "role != 'manager'", sql: "role != 'manager'" },
      // shift ファミリー
      { id: 's_morning', label: "shift = 'morning'", sql: "shift = 'morning'" },
      { id: 's_evening', label: "shift = 'evening'", sql: "shift = 'evening'" },
      { id: 's_night', label: "shift = 'night'", sql: "shift = 'night'" },
      { id: 's_not_morning', label: "shift != 'morning'", sql: "shift != 'morning'" },
      { id: 's_not_evening', label: "shift != 'evening'", sql: "shift != 'evening'" },
      { id: 's_not_night', label: "shift != 'night'", sql: "shift != 'night'" },
    ],
  },
  {
    id: 'stock',
    title: '在庫',
    columns: ['name', 'qty', 'reorder', 'category', 'note'],
    similarColumns: [['qty', 'reorder']],
    rows: [
      { id: 1, name: 'まぐろ', qty: 12, reorder: 5, category: 'fish', note: 'ok' },
      { id: 2, name: 'サーモン', qty: 3, reorder: 5, category: 'fish', note: 'low' },
      { id: 3, name: 'えび', qty: 0, reorder: 4, category: 'fish', note: 'out' },
      { id: 4, name: 'たまご', qty: 30, reorder: 10, category: 'egg', note: 'ok' },
      { id: 5, name: 'うに', qty: 2, reorder: 3, category: 'fish', note: 'low' },
      { id: 6, name: '中とろ', qty: 7, reorder: 5, category: 'fish', note: null },
      { id: 7, name: '大とろ', qty: 1, reorder: 2, category: 'fish', note: 'low' },
      { id: 8, name: 'のり', qty: 9, reorder: 9, category: 'dry', note: 'ok' },
    ],
    candidates: [
      // qty ファミリー
      { id: 'k_qty_gt5', label: 'qty > 5', sql: 'qty > 5' },
      { id: 'k_qty_ge3', label: 'qty >= 3', sql: 'qty >= 3' },
      { id: 'k_qty_lt3', label: 'qty < 3', sql: 'qty < 3' },
      { id: 'k_qty_le3', label: 'qty <= 3', sql: 'qty <= 3' },
      { id: 'k_qty_gt20', label: 'qty > 20', sql: 'qty > 20' },
      // reorder ファミリー（似た列名の罠）
      { id: 'k_reorder_gt5', label: 'reorder > 5', sql: 'reorder > 5' },
      { id: 'k_reorder_ge5', label: 'reorder >= 5', sql: 'reorder >= 5' },
      { id: 'k_reorder_lt5', label: 'reorder < 5', sql: 'reorder < 5' },
      { id: 'k_reorder_le5', label: 'reorder <= 5', sql: 'reorder <= 5' },
      { id: 'k_reorder_gt8', label: 'reorder > 8', sql: 'reorder > 8' },
      // category ファミリー
      { id: 'k_fish', label: "category = 'fish'", sql: "category = 'fish'" },
      { id: 'k_egg', label: "category = 'egg'", sql: "category = 'egg'" },
      { id: 'k_dry', label: "category = 'dry'", sql: "category = 'dry'" },
      { id: 'k_not_fish', label: "category != 'fish'", sql: "category != 'fish'" },
      { id: 'k_not_egg', label: "category != 'egg'", sql: "category != 'egg'" },
      { id: 'k_not_dry', label: "category != 'dry'", sql: "category != 'dry'" },
      // note ファミリー
      { id: 'k_low', label: "note = 'low'", sql: "note = 'low'" },
      { id: 'k_ok', label: "note = 'ok'", sql: "note = 'ok'" },
      { id: 'k_out', label: "note = 'out'", sql: "note = 'out'" },
      { id: 'k_note_null', label: 'note IS NULL', sql: 'note IS NULL' },
      { id: 'k_note_not_null', label: 'note IS NOT NULL', sql: 'note IS NOT NULL' },
      { id: 'k_not_low', label: "note != 'low'", sql: "note != 'low'" },
    ],
  },
];

export const DATASET_BY_ID = new Map(DATASETS.map((d) => [d.id, d]));
