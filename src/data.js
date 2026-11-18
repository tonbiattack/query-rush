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

/* ── Advanced / Logic / Aggregate / Pipeline 用の素材 ──────────── */

/**
 * 上級モード以降で使うデータセット。
 *
 * mode はそのデータセットを出題するモード。
 * candidates は Filter と同じ形式（sql は安全な式パーサーを通る）。
 * 集計・パイプラインは candidates ではなく専用の定義を持つ。
 */
export const MODE_DATASETS = [
  {
    id: 'scores',
    mode: 'advanced',
    title: '成績',
    columns: ['name', 'score', 'subject', 'attempts', 'note'],
    similarColumns: [['score', 'attempts']],
    rows: [
      { id: 1, name: '田中', score: 82, subject: 'math', attempts: 2, note: 'ok' },
      { id: 2, name: '佐藤', score: 58, subject: 'math', attempts: 1, note: 'retry' },
      { id: 3, name: '鈴木', score: 91, subject: 'science', attempts: 3, note: 'retry' },
      { id: 4, name: '高橋', score: 74, subject: 'science', attempts: 1, note: null },
      { id: 5, name: '伊藤', score: 65, subject: 'math', attempts: 2, note: 'ok' },
      { id: 6, name: '渡辺', score: 88, subject: 'english', attempts: 1, note: 'ok' },
      { id: 7, name: '山本', score: 45, subject: 'english', attempts: 4, note: 'retry' },
      { id: 8, name: '中村', score: 80, subject: 'science', attempts: 2, note: null },
    ],
    candidates: [
      // 複合条件（AND / OR）
      { id: 'sc_and', label: "score >= 80 AND subject = 'math'", sql: "score >= 80 AND subject = 'math'" },
      { id: 'sc_or', label: "subject = 'math' OR subject = 'english'", sql: "subject = 'math' OR subject = 'english'" },
      { id: 'sc_and_or', label: "score >= 80 AND (subject = 'math' OR subject = 'science')", sql: "score >= 80 AND (subject = 'math' OR subject = 'science')" },
      { id: 'sc_not', label: 'NOT (score >= 80)', sql: 'NOT (score >= 80)' },
      { id: 'sc_and_retry', label: "score < 80 AND note = 'retry'", sql: "score < 80 AND note = 'retry'" },
      // IN / NOT IN
      { id: 'sc_in_math_sci', label: "subject IN ('math', 'science')", sql: "subject IN ('math', 'science')" },
      { id: 'sc_in_high', label: 'score IN (91, 74, 45)', sql: 'score IN (91, 74, 45)' },
      { id: 'sc_not_in_math', label: "subject NOT IN ('math')", sql: "subject NOT IN ('math')" },
      // BETWEEN
      { id: 'sc_between', label: 'score BETWEEN 60 AND 85', sql: 'score BETWEEN 60 AND 85' },
      { id: 'sc_not_between', label: 'score NOT BETWEEN 60 AND 85', sql: 'score NOT BETWEEN 60 AND 85' },
      { id: 'sc_between_att', label: 'attempts BETWEEN 2 AND 3', sql: 'attempts BETWEEN 2 AND 3' },
      // LIKE
      { id: 'sc_like_fuji', label: "name LIKE '%藤%'", sql: "name LIKE '%藤%'" },
      { id: 'sc_like_mura', label: "name LIKE '%村%'", sql: "name LIKE '%村%'" },
      // NULL 三値論理
      { id: 'sc_note_null', label: 'note IS NULL', sql: 'note IS NULL' },
      { id: 'sc_note_not_null', label: 'note IS NOT NULL', sql: 'note IS NOT NULL' },
      { id: 'sc_note_ok', label: "note = 'ok'", sql: "note = 'ok'" },
      { id: 'sc_note_not_ok', label: "note != 'ok'", sql: "note != 'ok'" },
      // 単純比較（比較用）
      { id: 'sc_score_gt80', label: 'score > 80', sql: 'score > 80' },
      { id: 'sc_score_ge80', label: 'score >= 80', sql: 'score >= 80' },
      { id: 'sc_attempts_gt2', label: 'attempts > 2', sql: 'attempts > 2' },
      { id: 'sc_attempts_ge2', label: 'attempts >= 2', sql: 'attempts >= 2' },
      { id: 'sc_attempts_lt2', label: 'attempts < 2', sql: 'attempts < 2' },
      { id: 'sc_attempts_le2', label: 'attempts <= 2', sql: 'attempts <= 2' },
      { id: 'sc_attempts_gt3', label: 'attempts > 3', sql: 'attempts > 3' },
    ],
  },
  {
    id: 'temps',
    mode: 'logic',
    title: '気温',
    columns: ['city', 'temp', 'humidity', 'weather', 'memo'],
    similarColumns: [['temp', 'humidity']],
    rows: [
      { id: 1, city: '東京', temp: 28, humidity: 60, weather: 'sunny', memo: 'ok' },
      { id: 2, city: '大阪', temp: 31, humidity: 75, weather: 'cloudy', memo: null },
      { id: 3, city: '札幌', temp: 18, humidity: 55, weather: 'rain', memo: 'cool' },
      { id: 4, city: '福岡', temp: 33, humidity: 80, weather: 'sunny', memo: 'hot' },
      { id: 5, city: '名古屋', temp: 26, humidity: null, weather: 'cloudy', memo: null },
      { id: 6, city: '仙台', temp: 22, humidity: 65, weather: 'cloudy', memo: 'cool' },
      { id: 7, city: '広島', temp: 30, humidity: 70, weather: 'sunny', memo: 'hot' },
      { id: 8, city: '那覇', temp: 35, humidity: 85, weather: 'sunny', memo: null },
    ],
    candidates: [
      // CASE: 評価順（最初に成立した WHEN で確定）と ELSE 欠落
      { id: 'tp_case_a', label: "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'A'", sql: "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'A'" },
      { id: 'tp_case_b', label: "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'B'", sql: "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'B'" },
      { id: 'tp_case_c', label: "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'C'", sql: "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'C'" },
      { id: 'tp_case_noelse', label: "CASE WHEN temp >= 30 THEN 'hot' END IS NULL", sql: "CASE WHEN temp >= 30 THEN 'hot' END IS NULL" },
      // COALESCE: NULL を補う（同じ関数の候補を複数用意して惜しい不正解を確保する）
      { id: 'tp_coalesce_memo', label: "COALESCE(memo, 'none') = 'none'", sql: "COALESCE(memo, 'none') = 'none'" },
      { id: 'tp_coalesce_memo2', label: "COALESCE(memo, 'none') = 'cool'", sql: "COALESCE(memo, 'none') = 'cool'" },
      { id: 'tp_coalesce_memo3', label: "COALESCE(memo, 'none') = 'hot'", sql: "COALESCE(memo, 'none') = 'hot'" },
      { id: 'tp_coalesce_hum', label: 'COALESCE(humidity, 100) > 70', sql: 'COALESCE(humidity, 100) > 70' },
      { id: 'tp_coalesce_hum2', label: 'COALESCE(humidity, 100) > 80', sql: 'COALESCE(humidity, 100) > 80' },
      { id: 'tp_coalesce_hum3', label: 'COALESCE(humidity, 100) >= 75', sql: 'COALESCE(humidity, 100) >= 75' },
      // NULLIF: 等しいとき NULL になる
      { id: 'tp_nullif_temp', label: 'NULLIF(temp, 28) IS NULL', sql: 'NULLIF(temp, 28) IS NULL' },
      { id: 'tp_nullif_temp2', label: 'NULLIF(temp, 30) IS NULL', sql: 'NULLIF(temp, 30) IS NULL' },
      { id: 'tp_nullif_temp3', label: 'NULLIF(temp, 22) IS NULL', sql: 'NULLIF(temp, 22) IS NULL' },
      { id: 'tp_nullif_hum', label: 'NULLIF(humidity, 60) IS NOT NULL', sql: 'NULLIF(humidity, 60) IS NOT NULL' },
      { id: 'tp_nullif_hum2', label: 'NULLIF(humidity, 75) IS NULL', sql: 'NULLIF(humidity, 75) IS NULL' },
      { id: 'tp_nullif_hum3', label: 'NULLIF(humidity, 80) IS NULL', sql: 'NULLIF(humidity, 80) IS NULL' },
      // 比較（Logic の結果と重ならないものだけ残す）
      { id: 'tp_temp_gt30', label: 'temp > 30', sql: 'temp > 30' },
      { id: 'tp_hum_null', label: 'humidity IS NULL', sql: 'humidity IS NULL' },
      { id: 'tp_hum_not_null', label: 'humidity IS NOT NULL', sql: 'humidity IS NOT NULL' },
      { id: 'tp_sunny', label: "weather = 'sunny'", sql: "weather = 'sunny'" },
      { id: 'tp_cloudy', label: "weather = 'cloudy'", sql: "weather = 'cloudy'" },
      { id: 'tp_temp_lt20', label: 'temp < 20', sql: 'temp < 20' },
      { id: 'tp_temp_gt20', label: 'temp > 20', sql: 'temp > 20' },
    ],
  },
  {
    id: 'sales',
    mode: 'aggregate',
    title: '売上',
    columns: ['shop', 'category', 'amount', 'qty', 'region'],
    similarColumns: [['amount', 'qty']],
    rows: [
      { id: 1, shop: '渋谷', category: 'food', amount: 1200, qty: 3, region: 'east' },
      { id: 2, shop: '渋谷', category: 'drink', amount: 800, qty: 5, region: 'east' },
      { id: 3, shop: '新宿', category: 'food', amount: 1500, qty: 4, region: 'east' },
      { id: 4, shop: '新宿', category: 'drink', amount: 600, qty: 2, region: 'east' },
      { id: 5, shop: '梅田', category: 'food', amount: 2000, qty: 6, region: 'west' },
      { id: 6, shop: '梅田', category: 'drink', amount: 900, qty: 3, region: 'west' },
      { id: 7, shop: '難波', category: 'food', amount: 1100, qty: 2, region: 'west' },
      { id: 8, shop: '難波', category: 'drink', amount: null, qty: 1, region: 'west' },
    ],
    candidates: [
      { id: 'sa_food', label: "category = 'food'", sql: "category = 'food'" },
      { id: 'sa_drink', label: "category = 'drink'", sql: "category = 'drink'" },
      { id: 'sa_east', label: "region = 'east'", sql: "region = 'east'" },
      { id: 'sa_west', label: "region = 'west'", sql: "region = 'west'" },
      { id: 'sa_amount_gt1000', label: 'amount > 1000', sql: 'amount > 1000' },
      { id: 'sa_amount_null', label: 'amount IS NULL', sql: 'amount IS NULL' },
      { id: 'sa_qty_gt3', label: 'qty > 3', sql: 'qty > 3' },
    ],
    /** 集計問題の定義（GROUP BY / HAVING） */
    aggregates: [
      {
        id: 'sa_by_category',
        label: "GROUP BY category",
        groupBy: 'category',
        select: [
          { column: 'category', as: 'category' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(amount)', as: '合計' },
        ],
        orderBy: 'category',
      },
      {
        id: 'sa_by_region',
        label: 'GROUP BY region',
        groupBy: 'region',
        select: [
          { column: 'region', as: 'region' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(amount)', as: '合計' },
        ],
        orderBy: 'region',
      },
      {
        id: 'sa_by_shop',
        label: 'GROUP BY shop',
        groupBy: 'shop',
        select: [
          { column: 'shop', as: 'shop' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(qty)', as: '数量' },
        ],
        orderBy: 'shop',
      },
      {
        id: 'sa_count_col',
        label: 'COUNT(amount) で NULL を数えない',
        groupBy: 'category',
        select: [
          { column: 'category', as: 'category' },
          { expr: 'COUNT(amount)', as: '金額あり' },
          { expr: 'COUNT(*)', as: '全件' },
        ],
        orderBy: 'category',
      },
      {
        id: 'sa_having',
        label: 'HAVING SUM(amount) > 2000',
        groupBy: 'shop',
        select: [
          { column: 'shop', as: 'shop' },
          { expr: 'SUM(amount)', as: '合計' },
        ],
        having: 'SUM(amount) > 2000',
        orderBy: 'shop',
      },
      {
        id: 'sa_avg',
        label: 'AVG(amount) で平均',
        groupBy: 'region',
        select: [
          { column: 'region', as: 'region' },
          { expr: 'AVG(amount)', as: '平均' },
          { expr: 'MAX(amount)', as: '最大' },
        ],
        orderBy: 'region',
      },
    ],
  },
  {
    id: 'members',
    mode: 'pipeline',
    title: '会員',
    columns: ['name', 'score', 'active', 'plan', 'team'],
    similarColumns: [['score', 'active']],
    rows: [
      { id: 1, name: '田中', score: 82, active: 1, plan: 'pro', team: 'a' },
      { id: 2, name: '佐藤', score: 58, active: 1, plan: 'free', team: 'a' },
      { id: 3, name: '鈴木', score: 91, active: 0, plan: 'pro', team: 'b' },
      { id: 4, name: '高橋', score: 74, active: 1, plan: 'free', team: 'b' },
      { id: 5, name: '伊藤', score: 65, active: 1, plan: 'pro', team: 'a' },
      { id: 6, name: '渡辺', score: 88, active: 1, plan: 'free', team: 'c' },
      { id: 7, name: '山本', score: 45, active: 0, plan: 'free', team: 'c' },
      { id: 8, name: '中村', score: 79, active: 1, plan: 'pro', team: 'b' },
    ],
    candidates: [
      { id: 'mb_score_ge80', label: 'score >= 80', sql: 'score >= 80' },
      { id: 'mb_active', label: 'active = 1', sql: 'active = 1' },
      { id: 'mb_pro', label: "plan = 'pro'", sql: "plan = 'pro'" },
      { id: 'mb_team_a', label: "team = 'a'", sql: "team = 'a'" },
      { id: 'mb_team_b', label: "team = 'b'", sql: "team = 'b'" },
      { id: 'mb_score_lt60', label: 'score < 60', sql: 'score < 60' },
    ],
    /**
     * パイプライン問題（CTE）の定義。
     *
     * 各段の条件は累積で効く。最終段（finalWhere）で必ず行が減るようにしてある。
     * 中間結果と最終結果が同じだと「段を追う」意味がなくなるため、
     * 生成側（questions.js）がその条件を検証して弾く。
     */
    pipelines: [
      {
        id: 'mb_cte_high',
        label: 'WITH high AS (score >= 80) SELECT * FROM high WHERE active = 1',
        steps: [{ name: 'high', where: 'score >= 80' }],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_pro',
        label: 'WITH pro AS (plan = pro) SELECT * FROM pro WHERE score >= 70',
        steps: [{ name: 'pro', where: "plan = 'pro'" }],
        finalWhere: 'score >= 70',
      },
      {
        id: 'mb_cte_team',
        label: 'WITH a AS (team = a) SELECT * FROM a WHERE active = 1',
        steps: [{ name: 'a', where: "team = 'a'" }],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_b',
        label: 'WITH b AS (team = b) SELECT * FROM b WHERE score >= 70',
        steps: [{ name: 'b', where: "team = 'b'" }],
        finalWhere: 'score >= 70',
      },
      {
        id: 'mb_cte_c',
        label: 'WITH c AS (team = c) SELECT * FROM c WHERE active = 1',
        steps: [{ name: 'c', where: "team = 'c'" }],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_low',
        label: 'WITH low AS (score < 80) SELECT * FROM low WHERE active = 1',
        steps: [{ name: 'low', where: 'score < 80' }],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_free',
        label: 'WITH f AS (plan = free) SELECT * FROM f WHERE active = 1',
        steps: [{ name: 'f', where: "plan = 'free'" }],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_two_step',
        label: 'WITH a AS (active = 1), b AS (score >= 70) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'active = 1' },
          { name: 'b', where: 'score >= 70' },
        ],
        finalWhere: "plan = 'pro'",
      },
    ],
  },
];

/** モードごとのデータセット一覧 */
export function datasetsForMode(mode) {
  return MODE_DATASETS.filter((dataset) => dataset.mode === mode);
}

/** 全データセット（Filter の素材と合わせる） */
export function allDatasets() {
  return [...DATASETS.map((d) => ({ ...d, mode: 'filter' })), ...MODE_DATASETS];
}

export const DATASET_BY_ID = new Map(allDatasets().map((d) => [d.id, d]));
