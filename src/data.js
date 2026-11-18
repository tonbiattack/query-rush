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
  {
    id: 'books',
    title: '書籍',
    columns: ['title', 'price', 'pages', 'genre', 'state'],
    similarColumns: [['price', 'pages']],
    rows: [
      { id: 1, title: 'SQL入門', price: 2800, pages: 320, genre: 'tech', state: 'sale' },
      { id: 2, title: 'データ設計', price: 3600, pages: 480, genre: 'tech', state: 'sale' },
      { id: 3, title: '小説A', price: 800, pages: 240, genre: 'novel', state: 'out' },
      { id: 4, title: '小説B', price: 950, pages: 300, genre: 'novel', state: 'sale' },
      { id: 5, title: '図鑑', price: 5200, pages: 600, genre: 'photo', state: 'sale' },
      { id: 6, title: '絵本', price: 1200, pages: 32, genre: 'kids', state: 'out' },
      { id: 7, title: '事典', price: null, pages: 1200, genre: 'tech', state: 'sale' },
      { id: 8, title: '雑誌', price: 600, pages: null, genre: 'photo', state: 'sale' },
    ],
    candidates: [
      { id: 'bk_tech', label: "genre = 'tech'", sql: "genre = 'tech'" },
      { id: 'bk_novel', label: "genre = 'novel'", sql: "genre = 'novel'" },
      { id: 'bk_photo', label: "genre = 'photo'", sql: "genre = 'photo'" },
      { id: 'bk_sale', label: "state = 'sale'", sql: "state = 'sale'" },
      { id: 'bk_out', label: "state = 'out'", sql: "state = 'out'" },
      { id: 'bk_price_gt1000', label: 'price > 1000', sql: 'price > 1000' },
      { id: 'bk_price_ge1000', label: 'price >= 1000', sql: 'price >= 1000' },
      { id: 'bk_price_lt1000', label: 'price < 1000', sql: 'price < 1000' },
      { id: 'bk_price_null', label: 'price IS NULL', sql: 'price IS NULL' },
      { id: 'bk_price_not_null', label: 'price IS NOT NULL', sql: 'price IS NOT NULL' },
      { id: 'bk_pages_gt300', label: 'pages > 300', sql: 'pages > 300' },
      { id: 'bk_pages_ge300', label: 'pages >= 300', sql: 'pages >= 300' },
      { id: 'bk_pages_lt300', label: 'pages < 300', sql: 'pages < 300' },
      { id: 'bk_pages_null', label: 'pages IS NULL', sql: 'pages IS NULL' },
    ],
  },
  {
    id: 'flights',
    title: '便',
    columns: ['code', 'fare', 'seats', 'cabin', 'state'],
    similarColumns: [['fare', 'seats']],
    rows: [
      { id: 1, code: 'NH1', fare: 18000, seats: 120, cabin: 'economy', state: 'open' },
      { id: 2, code: 'NH2', fare: 42000, seats: 20, cabin: 'business', state: 'open' },
      { id: 3, code: 'JL1', fare: 16000, seats: 150, cabin: 'economy', state: 'full' },
      { id: 4, code: 'JL2', fare: 38000, seats: 30, cabin: 'business', state: 'open' },
      { id: 5, code: 'MM1', fare: 9000, seats: 180, cabin: 'economy', state: 'open' },
      { id: 6, code: 'MM2', fare: 8000, seats: 0, cabin: 'economy', state: 'full' },
      { id: 7, code: 'NH3', fare: null, seats: 100, cabin: 'economy', state: 'open' },
      { id: 8, code: 'JL3', fare: 55000, seats: null, cabin: 'first', state: 'open' },
    ],
    candidates: [
      { id: 'fl_economy', label: "cabin = 'economy'", sql: "cabin = 'economy'" },
      { id: 'fl_business', label: "cabin = 'business'", sql: "cabin = 'business'" },
      { id: 'fl_first', label: "cabin = 'first'", sql: "cabin = 'first'" },
      { id: 'fl_open', label: "state = 'open'", sql: "state = 'open'" },
      { id: 'fl_full', label: "state = 'full'", sql: "state = 'full'" },
      { id: 'fl_fare_gt20000', label: 'fare > 20000', sql: 'fare > 20000' },
      { id: 'fl_fare_ge20000', label: 'fare >= 20000', sql: 'fare >= 20000' },
      { id: 'fl_fare_lt20000', label: 'fare < 20000', sql: 'fare < 20000' },
      { id: 'fl_fare_null', label: 'fare IS NULL', sql: 'fare IS NULL' },
      { id: 'fl_fare_not_null', label: 'fare IS NOT NULL', sql: 'fare IS NOT NULL' },
      { id: 'fl_seats_gt100', label: 'seats > 100', sql: 'seats > 100' },
      { id: 'fl_seats_ge100', label: 'seats >= 100', sql: 'seats >= 100' },
      { id: 'fl_seats_lt100', label: 'seats < 100', sql: 'seats < 100' },
      { id: 'fl_seats_null', label: 'seats IS NULL', sql: 'seats IS NULL' },
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
        label: 'GROUP BY category で COUNT(amount)（NULL を数えない）',
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
      {
        id: 'sa_having_count',
        label: 'HAVING COUNT(*) > 1',
        groupBy: 'category',
        select: [
          { column: 'category', as: 'category' },
          { expr: 'COUNT(*)', as: '件数' },
        ],
        having: 'COUNT(*) > 1',
        orderBy: 'category',
      },
      {
        id: 'sa_min',
        label: 'MIN(amount) で最小',
        groupBy: 'category',
        select: [
          { column: 'category', as: 'category' },
          { expr: 'MIN(amount)', as: '最小' },
          { expr: 'COUNT(*)', as: '件数' },
        ],
        orderBy: 'category',
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
      {
        id: 'mb_cte_team_a_pro',
        label: 'WITH a AS (team = a) SELECT * FROM a WHERE plan = pro',
        steps: [{ name: 'a', where: "team = 'a'" }],
        finalWhere: "plan = 'pro'",
      },
      {
        id: 'mb_cte_team_b_active',
        label: 'WITH b AS (team = b) SELECT * FROM b WHERE active = 1',
        steps: [{ name: 'b', where: "team = 'b'" }],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_team_c_pro',
        label: 'WITH c AS (team = c) SELECT * FROM c WHERE plan = pro',
        steps: [{ name: 'c', where: "team = 'c'" }],
        finalWhere: "plan = 'pro'",
      },
      {
        id: 'mb_cte_active_high',
        label: 'WITH a AS (active = 1) SELECT * FROM a WHERE score >= 80',
        steps: [{ name: 'a', where: 'active = 1' }],
        finalWhere: 'score >= 80',
      },
      {
        id: 'mb_cte_free_low',
        label: 'WITH f AS (plan = free) SELECT * FROM f WHERE score < 70',
        steps: [{ name: 'f', where: "plan = 'free'" }],
        finalWhere: 'score < 70',
      },
      {
        id: 'mb_cte_two_step2',
        label: 'WITH a AS (team = a), b AS (plan = pro) SELECT * FROM b',
        steps: [
          { name: 'a', where: "team = 'a'" },
          { name: 'b', where: "plan = 'pro'" },
        ],
        finalWhere: 'score >= 70',
      },
      {
        id: 'mb_cte_two_step3',
        label: 'WITH a AS (plan = pro), b AS (active = 1) SELECT * FROM b',
        steps: [
          { name: 'a', where: "plan = 'pro'" },
          { name: 'b', where: 'active = 1' },
        ],
        finalWhere: 'score >= 80',
      },
      {
        id: 'mb_cte_two_step4',
        label: 'WITH a AS (score >= 70), b AS (team = b) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'score >= 70' },
          { name: 'b', where: "team = 'b'" },
        ],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_two_step5',
        label: 'WITH a AS (active = 1), b AS (team = a) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'active = 1' },
          { name: 'b', where: "team = 'a'" },
        ],
        finalWhere: "plan = 'pro'",
      },
      {
        id: 'mb_cte_two_step6',
        label: 'WITH a AS (score < 80), b AS (plan = free) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'score < 80' },
          { name: 'b', where: "plan = 'free'" },
        ],
        finalWhere: 'active = 1',
      },
      {
        id: 'mb_cte_two_step7',
        label: 'WITH a AS (team = c), b AS (active = 1) SELECT * FROM b',
        steps: [
          { name: 'a', where: "team = 'c'" },
          { name: 'b', where: 'active = 1' },
        ],
        finalWhere: 'score >= 80',
      },
    ],  },
  /* ── Aggregate 拡充用（#22） ─────────────────────────── */
  {
    id: 'visits',
    mode: 'aggregate',
    title: '来店',
    columns: ['store', 'day', 'guests', 'spend', 'channel'],
    similarColumns: [['guests', 'spend']],
    rows: [
      { id: 1, store: '渋谷', day: 'mon', guests: 12, spend: 4800, channel: 'walk' },
      { id: 2, store: '渋谷', day: 'tue', guests: 8, spend: 3200, channel: 'web' },
      { id: 3, store: '新宿', day: 'mon', guests: 20, spend: 9000, channel: 'walk' },
      { id: 4, store: '新宿', day: 'wed', guests: 5, spend: 1500, channel: 'web' },
      { id: 5, store: '梅田', day: 'tue', guests: 15, spend: 6000, channel: 'walk' },
      { id: 6, store: '梅田', day: 'wed', guests: null, spend: 2000, channel: 'web' },
      { id: 7, store: '難波', day: 'mon', guests: 9, spend: null, channel: 'walk' },
      { id: 8, store: '難波', day: 'tue', guests: 3, spend: 900, channel: 'web' },
    ],
    candidates: [
      { id: 'vi_walk', label: "channel = 'walk'", sql: "channel = 'walk'" },
      { id: 'vi_web', label: "channel = 'web'", sql: "channel = 'web'" },
      { id: 'vi_mon', label: "day = 'mon'", sql: "day = 'mon'" },
      { id: 'vi_guests_gt10', label: 'guests > 10', sql: 'guests > 10' },
      { id: 'vi_guests_null', label: 'guests IS NULL', sql: 'guests IS NULL' },
      { id: 'vi_spend_null', label: 'spend IS NULL', sql: 'spend IS NULL' },
    ],
    aggregates: [
      {
        id: 'vi_by_store',
        label: 'GROUP BY store',
        groupBy: 'store',
        select: [
          { column: 'store', as: 'store' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(guests)', as: '客数' },
        ],
        orderBy: 'store',
      },
      {
        id: 'vi_by_day',
        label: 'GROUP BY day',
        groupBy: 'day',
        select: [
          { column: 'day', as: 'day' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(spend)', as: '売上' },
        ],
        orderBy: 'day',
      },
      {
        id: 'vi_by_channel',
        label: 'GROUP BY channel',
        groupBy: 'channel',
        select: [
          { column: 'channel', as: 'channel' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'AVG(guests)', as: '平均客数' },
        ],
        orderBy: 'channel',
      },
      {
        id: 'vi_count_guests',
        label: 'GROUP BY store で COUNT(guests)（NULL を数えない）',
        groupBy: 'store',
        select: [
          { column: 'store', as: 'store' },
          { expr: 'COUNT(guests)', as: '客数あり' },
          { expr: 'COUNT(*)', as: '全件' },
        ],
        orderBy: 'store',
      },
      {
        id: 'vi_count_spend',
        label: 'GROUP BY channel で COUNT(spend)（NULL を数えない）',
        groupBy: 'channel',
        select: [
          { column: 'channel', as: 'channel' },
          { expr: 'COUNT(spend)', as: '売上あり' },
          { expr: 'COUNT(*)', as: '全件' },
        ],
        orderBy: 'channel',
      },
      {
        id: 'vi_having_guests',
        label: 'HAVING SUM(guests) > 15',
        groupBy: 'store',
        select: [
          { column: 'store', as: 'store' },
          { expr: 'SUM(guests)', as: '客数' },
        ],
        having: 'SUM(guests) > 15',
        orderBy: 'store',
      },
      {
        id: 'vi_having_spend',
        label: 'HAVING SUM(spend) > 5000',
        groupBy: 'store',
        select: [
          { column: 'store', as: 'store' },
          { expr: 'SUM(spend)', as: '売上' },
        ],
        having: 'SUM(spend) > 5000',
        orderBy: 'store',
      },
      {
        id: 'vi_max_min',
        label: 'MAX / MIN で最大最小',
        groupBy: 'day',
        select: [
          { column: 'day', as: 'day' },
          { expr: 'MAX(guests)', as: '最大客数' },
          { expr: 'MIN(guests)', as: '最小客数' },
        ],
        orderBy: 'day',
      },
    ],
  },
  {
    id: 'grades',
    mode: 'aggregate',
    title: '成績',
    columns: ['class', 'student', 'score', 'hours', 'term'],
    similarColumns: [['score', 'hours']],
    rows: [
      { id: 1, class: 'A', student: '田中', score: 82, hours: 10, term: 'spring' },
      { id: 2, class: 'A', student: '佐藤', score: 58, hours: 4, term: 'spring' },
      { id: 3, class: 'B', student: '鈴木', score: 91, hours: 15, term: 'spring' },
      { id: 4, class: 'B', student: '高橋', score: 74, hours: 8, term: 'fall' },
      { id: 5, class: 'A', student: '伊藤', score: 65, hours: 6, term: 'fall' },
      { id: 6, class: 'B', student: '渡辺', score: null, hours: 12, term: 'fall' },
      { id: 7, class: 'C', student: '山本', score: 45, hours: null, term: 'spring' },
      { id: 8, class: 'C', student: '中村', score: 79, hours: 9, term: 'fall' },
    ],
    candidates: [
      { id: 'gr_spring', label: "term = 'spring'", sql: "term = 'spring'" },
      { id: 'gr_fall', label: "term = 'fall'", sql: "term = 'fall'" },
      { id: 'gr_score_gt70', label: 'score > 70', sql: 'score > 70' },
      { id: 'gr_score_null', label: 'score IS NULL', sql: 'score IS NULL' },
      { id: 'gr_hours_null', label: 'hours IS NULL', sql: 'hours IS NULL' },
    ],
    aggregates: [
      {
        id: 'gr_by_class',
        label: 'GROUP BY class',
        groupBy: 'class',
        select: [
          { column: 'class', as: 'class' },
          { expr: 'COUNT(*)', as: '人数' },
          { expr: 'AVG(score)', as: '平均点' },
        ],
        orderBy: 'class',
      },
      {
        id: 'gr_by_term',
        label: 'GROUP BY term',
        groupBy: 'term',
        select: [
          { column: 'term', as: 'term' },
          { expr: 'COUNT(*)', as: '人数' },
          { expr: 'SUM(hours)', as: '学習時間' },
        ],
        orderBy: 'term',
      },
      {
        id: 'gr_count_score',
        label: 'GROUP BY class で COUNT(score)（NULL を数えない）',
        groupBy: 'class',
        select: [
          { column: 'class', as: 'class' },
          { expr: 'COUNT(score)', as: '点数あり' },
          { expr: 'COUNT(*)', as: '全員' },
        ],
        orderBy: 'class',
      },
      {
        id: 'gr_count_hours',
        label: 'GROUP BY term で COUNT(hours)（NULL を数えない）',
        groupBy: 'term',
        select: [
          { column: 'term', as: 'term' },
          { expr: 'COUNT(hours)', as: '時間あり' },
          { expr: 'COUNT(*)', as: '全員' },
        ],
        orderBy: 'term',
      },
      {
        id: 'gr_having_avg',
        label: 'HAVING AVG(score) > 70',
        groupBy: 'class',
        select: [
          { column: 'class', as: 'class' },
          { expr: 'AVG(score)', as: '平均点' },
        ],
        having: 'AVG(score) > 70',
        orderBy: 'class',
      },
      {
        id: 'gr_having_count',
        label: 'HAVING COUNT(*) > 2',
        groupBy: 'class',
        select: [
          { column: 'class', as: 'class' },
          { expr: 'COUNT(*)', as: '人数' },
        ],
        having: 'COUNT(*) > 2',
        orderBy: 'class',
      },
      {
        id: 'gr_max_min',
        label: 'MAX / MIN で最高最低',
        groupBy: 'class',
        select: [
          { column: 'class', as: 'class' },
          { expr: 'MAX(score)', as: '最高点' },
          { expr: 'MIN(score)', as: '最低点' },
        ],
        orderBy: 'class',
      },
      {
        id: 'gr_sum_hours',
        label: 'SUM(hours) で合計時間',
        groupBy: 'class',
        select: [
          { column: 'class', as: 'class' },
          { expr: 'SUM(hours)', as: '合計時間' },
          { expr: 'COUNT(*)', as: '人数' },
        ],
        orderBy: 'class',
      },
    ],
  },
  {
    id: 'tickets',
    mode: 'aggregate',    title: 'チケット',
    columns: ['team', 'priority', 'hours', 'points', 'status'],
    similarColumns: [['hours', 'points']],
    rows: [
      { id: 1, team: 'api', priority: 'high', hours: 8, points: 5, status: 'done' },
      { id: 2, team: 'api', priority: 'low', hours: 2, points: 1, status: 'done' },
      { id: 3, team: 'web', priority: 'high', hours: 12, points: 8, status: 'open' },
      { id: 4, team: 'web', priority: 'mid', hours: 5, points: 3, status: 'done' },
      { id: 5, team: 'api', priority: 'mid', hours: null, points: 3, status: 'open' },
      { id: 6, team: 'infra', priority: 'high', hours: 20, points: 13, status: 'done' },
      { id: 7, team: 'infra', priority: 'low', hours: 3, points: null, status: 'open' },
      { id: 8, team: 'web', priority: 'low', hours: 1, points: 1, status: 'done' },
    ],
    candidates: [
      { id: 'tk_done', label: "status = 'done'", sql: "status = 'done'" },
      { id: 'tk_open', label: "status = 'open'", sql: "status = 'open'" },
      { id: 'tk_high', label: "priority = 'high'", sql: "priority = 'high'" },
      { id: 'tk_hours_null', label: 'hours IS NULL', sql: 'hours IS NULL' },
      { id: 'tk_points_null', label: 'points IS NULL', sql: 'points IS NULL' },
    ],
    aggregates: [
      {
        id: 'tk_by_team',
        label: 'GROUP BY team',
        groupBy: 'team',
        select: [
          { column: 'team', as: 'team' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(points)', as: 'ポイント' },
        ],
        orderBy: 'team',
      },
      {
        id: 'tk_by_priority',
        label: 'GROUP BY priority',
        groupBy: 'priority',
        select: [
          { column: 'priority', as: 'priority' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'SUM(hours)', as: '工数' },
        ],
        orderBy: 'priority',
      },
      {
        id: 'tk_by_status',
        label: 'GROUP BY status',
        groupBy: 'status',
        select: [
          { column: 'status', as: 'status' },
          { expr: 'COUNT(*)', as: '件数' },
          { expr: 'AVG(points)', as: '平均ポイント' },
        ],
        orderBy: 'status',
      },
      {
        id: 'tk_count_hours',
        label: 'GROUP BY team で COUNT(hours)（NULL を数えない）',
        groupBy: 'team',
        select: [
          { column: 'team', as: 'team' },
          { expr: 'COUNT(hours)', as: '工数あり' },
          { expr: 'COUNT(*)', as: '全件' },
        ],
        orderBy: 'team',
      },
      {
        id: 'tk_count_points',
        label: 'GROUP BY priority で COUNT(points)（NULL を数えない）',
        groupBy: 'priority',
        select: [
          { column: 'priority', as: 'priority' },
          { expr: 'COUNT(points)', as: 'ポイントあり' },
          { expr: 'COUNT(*)', as: '全件' },
        ],
        orderBy: 'priority',
      },
      {
        id: 'tk_having_points',
        label: 'HAVING SUM(points) > 5',
        groupBy: 'team',
        select: [
          { column: 'team', as: 'team' },
          { expr: 'SUM(points)', as: 'ポイント' },
        ],
        having: 'SUM(points) > 5',
        orderBy: 'team',
      },
      {
        id: 'tk_having_hours',
        label: 'HAVING SUM(hours) > 10',
        groupBy: 'team',
        select: [
          { column: 'team', as: 'team' },
          { expr: 'SUM(hours)', as: '工数' },
        ],
        having: 'SUM(hours) > 10',
        orderBy: 'team',
      },
      {
        id: 'tk_max_min',
        label: 'MAX / MIN で最大最小',
        groupBy: 'team',
        select: [
          { column: 'team', as: 'team' },
          { expr: 'MAX(hours)', as: '最大工数' },
          { expr: 'MIN(hours)', as: '最小工数' },
        ],
        orderBy: 'team',
      },
    ],
  },
  /* ── Pipeline 拡充用（#22） ─────────────────────────── */
  {
    id: 'products',
    mode: 'pipeline',
    title: '商品',
    columns: ['name', 'price', 'stock', 'category', 'state'],
    similarColumns: [['price', 'stock']],
    rows: [
      { id: 1, name: 'まぐろ', price: 480, stock: 3, category: 'fish', state: 'on' },
      { id: 2, name: 'サーモン', price: 380, stock: 5, category: 'fish', state: 'on' },
      { id: 3, name: 'えび', price: 320, stock: 0, category: 'fish', state: 'off' },
      { id: 4, name: 'たまご', price: 180, stock: 8, category: 'egg', state: 'on' },
      { id: 5, name: 'うに', price: 1200, stock: 1, category: 'fish', state: 'on' },
      { id: 6, name: '中とろ', price: 1000, stock: 4, category: 'fish', state: 'off' },
      { id: 7, name: '大とろ', price: 1600, stock: 0, category: 'fish', state: 'on' },
      { id: 8, name: 'のり', price: 90, stock: 20, category: 'dry', state: 'on' },
    ],
    candidates: [
      { id: 'pr_on', label: "state = 'on'", sql: "state = 'on'" },
      { id: 'pr_off', label: "state = 'off'", sql: "state = 'off'" },
      { id: 'pr_fish', label: "category = 'fish'", sql: "category = 'fish'" },
      { id: 'pr_stock_gt0', label: 'stock > 0', sql: 'stock > 0' },
      { id: 'pr_price_gt500', label: 'price > 500', sql: 'price > 500' },
    ],
    pipelines: [
      {
        id: 'pr_cte_on',
        label: 'WITH on_sale AS (state = on) SELECT * FROM on_sale WHERE stock > 0',
        steps: [{ name: 'on_sale', where: "state = 'on'" }],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_fish',
        label: 'WITH fish AS (category = fish) SELECT * FROM fish WHERE price > 500',
        steps: [{ name: 'fish', where: "category = 'fish'" }],
        finalWhere: 'price > 500',
      },
      {
        id: 'pr_cte_cheap',
        label: 'WITH cheap AS (price < 500) SELECT * FROM cheap WHERE stock > 0',
        steps: [{ name: 'cheap', where: 'price < 500' }],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_off',
        label: 'WITH off_sale AS (state = off) SELECT * FROM off_sale WHERE stock > 0',
        steps: [{ name: 'off_sale', where: "state = 'off'" }],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_high',
        label: 'WITH high AS (price >= 1000) SELECT * FROM high WHERE state = on',
        steps: [{ name: 'high', where: 'price >= 1000' }],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_low',
        label: 'WITH low AS (price < 400) SELECT * FROM low WHERE state = on',
        steps: [{ name: 'low', where: 'price < 400' }],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_two',
        label: 'WITH a AS (state = on), b AS (stock > 0) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'on'" },
          { name: 'b', where: 'stock > 0' },
        ],
        finalWhere: "category = 'fish'",
      },
      {
        id: 'pr_cte_two2',
        label: 'WITH a AS (category = fish), b AS (price > 300) SELECT * FROM b',
        steps: [
          { name: 'a', where: "category = 'fish'" },
          { name: 'b', where: 'price > 300' },
        ],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_two3',
        label: 'WITH a AS (state = on), b AS (price > 300) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'on'" },
          { name: 'b', where: 'price > 300' },
        ],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_two4',
        label: 'WITH a AS (stock > 0), b AS (price < 1000) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'stock > 0' },
          { name: 'b', where: 'price < 1000' },
        ],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_fish_on',
        label: 'WITH fish AS (category = fish) SELECT * FROM fish WHERE state = on',
        steps: [{ name: 'fish', where: "category = 'fish'" }],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_cheap_on',
        label: 'WITH cheap AS (price < 500) SELECT * FROM cheap WHERE state = on',
        steps: [{ name: 'cheap', where: 'price < 500' }],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_high_stock',
        label: 'WITH high AS (price >= 1000) SELECT * FROM high WHERE stock > 0',
        steps: [{ name: 'high', where: 'price >= 1000' }],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_two5',
        label: 'WITH a AS (category = fish), b AS (state = on) SELECT * FROM b',
        steps: [
          { name: 'a', where: "category = 'fish'" },
          { name: 'b', where: "state = 'on'" },
        ],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_two6',
        label: 'WITH a AS (price > 300), b AS (stock > 0) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'price > 300' },
          { name: 'b', where: 'stock > 0' },
        ],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_two7',
        label: 'WITH a AS (state = on), b AS (category = fish) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'on'" },
          { name: 'b', where: "category = 'fish'" },
        ],
        finalWhere: 'price > 300',
      },
      {
        id: 'pr_cte_two8',
        label: 'WITH a AS (stock > 0), b AS (state = on) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'stock > 0' },
          { name: 'b', where: "state = 'on'" },
        ],
        finalWhere: 'price < 1000',
      },
      {
        id: 'pr_cte_two9',
        label: 'WITH a AS (price >= 1000), b AS (stock > 0) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'price >= 1000' },
          { name: 'b', where: 'stock > 0' },
        ],
        finalWhere: "state = 'on'",
      },
      {
        id: 'pr_cte_two10',
        label: 'WITH a AS (category = fish), b AS (price < 1000) SELECT * FROM b',
        steps: [
          { name: 'a', where: "category = 'fish'" },
          { name: 'b', where: 'price < 1000' },
        ],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_two11',
        label: 'WITH a AS (state = on), b AS (price >= 1000) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'on'" },
          { name: 'b', where: 'price >= 1000' },
        ],
        finalWhere: 'stock > 0',
      },
      {
        id: 'pr_cte_two12',
        label: 'WITH a AS (stock > 0), b AS (category = fish) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'stock > 0' },
          { name: 'b', where: "category = 'fish'" },
        ],
        finalWhere: 'price > 300',
      },
    ],
  },
  {
    id: 'events',
    mode: 'pipeline',
    title: 'イベント',
    columns: ['name', 'day', 'seats', 'fee', 'status'],
    similarColumns: [['seats', 'fee']],
    rows: [
      { id: 1, name: '講演', day: 'mon', seats: 50, fee: 1000, status: 'open' },
      { id: 2, name: '勉強会', day: 'tue', seats: 20, fee: 500, status: 'open' },
      { id: 3, name: '懇親会', day: 'mon', seats: 30, fee: 3000, status: 'closed' },
      { id: 4, name: '展示', day: 'wed', seats: 100, fee: 0, status: 'open' },
      { id: 5, name: '相談会', day: 'tue', seats: 5, fee: 2000, status: 'closed' },
      { id: 6, name: '発表', day: 'wed', seats: 40, fee: 1500, status: 'open' },
      { id: 7, name: '交流会', day: 'mon', seats: 25, fee: 2500, status: 'open' },
      { id: 8, name: '見学', day: 'tue', seats: 10, fee: 0, status: 'closed' },
    ],
    candidates: [
      { id: 'ev_open', label: "status = 'open'", sql: "status = 'open'" },
      { id: 'ev_closed', label: "status = 'closed'", sql: "status = 'closed'" },
      { id: 'ev_mon', label: "day = 'mon'", sql: "day = 'mon'" },
      { id: 'ev_free', label: 'fee = 0', sql: 'fee = 0' },
      { id: 'ev_seats_gt20', label: 'seats > 20', sql: 'seats > 20' },
    ],
    pipelines: [
      {
        id: 'ev_cte_open',
        label: 'WITH open_ev AS (status = open) SELECT * FROM open_ev WHERE seats > 20',
        steps: [{ name: 'open_ev', where: "status = 'open'" }],
        finalWhere: 'seats > 20',
      },
      {
        id: 'ev_cte_free',
        label: 'WITH free AS (fee = 0) SELECT * FROM free WHERE status = open',
        steps: [{ name: 'free', where: 'fee = 0' }],
        finalWhere: "status = 'open'",
      },
      {
        id: 'ev_cte_mon',
        label: 'WITH mon AS (day = mon) SELECT * FROM mon WHERE status = open',
        steps: [{ name: 'mon', where: "day = 'mon'" }],
        finalWhere: "status = 'open'",
      },
      {
        id: 'ev_cte_big',
        label: 'WITH big AS (seats > 20) SELECT * FROM big WHERE fee > 0',
        steps: [{ name: 'big', where: 'seats > 20' }],
        finalWhere: 'fee > 0',
      },
      {
        id: 'ev_cte_two',
        label: 'WITH a AS (status = open), b AS (seats > 20) SELECT * FROM b',
        steps: [
          { name: 'a', where: "status = 'open'" },
          { name: 'b', where: 'seats > 20' },
        ],
        finalWhere: 'fee > 0',
      },
      {
        id: 'ev_cte_closed',
        label: 'WITH closed_ev AS (status = closed) SELECT * FROM closed_ev WHERE seats > 5',
        steps: [{ name: 'closed_ev', where: "status = 'closed'" }],
        finalWhere: 'seats > 5',
      },
      {
        id: 'ev_cte_paid',
        label: 'WITH paid AS (fee > 0) SELECT * FROM paid WHERE day = mon',
        steps: [{ name: 'paid', where: 'fee > 0' }],
        finalWhere: "day = 'mon'",
      },
      {
        id: 'ev_cte_tue',
        label: 'WITH tue AS (day = tue) SELECT * FROM tue WHERE fee > 0',
        steps: [{ name: 'tue', where: "day = 'tue'" }],
        finalWhere: 'fee > 0',
      },
      {
        id: 'ev_cte_wed',
        label: 'WITH wed AS (day = wed) SELECT * FROM wed WHERE fee > 0',
        steps: [{ name: 'wed', where: "day = 'wed'" }],
        finalWhere: 'fee > 0',
      },
      {
        id: 'ev_cte_paid_open',
        label: 'WITH paid AS (fee > 0) SELECT * FROM paid WHERE status = open',
        steps: [{ name: 'paid', where: 'fee > 0' }],
        finalWhere: "status = 'open'",
      },
      {
        id: 'ev_cte_two2',
        label: 'WITH a AS (day = mon), b AS (fee > 0) SELECT * FROM b',
        steps: [
          { name: 'a', where: "day = 'mon'" },
          { name: 'b', where: 'fee > 0' },
        ],
        finalWhere: "status = 'open'",
      },
      {
        id: 'ev_cte_two3',
        label: 'WITH a AS (status = closed), b AS (fee > 0) SELECT * FROM b',
        steps: [
          { name: 'a', where: "status = 'closed'" },
          { name: 'b', where: 'fee > 0' },
        ],
        finalWhere: 'seats > 5',
      },
      {
        id: 'ev_cte_two4',
        label: 'WITH a AS (seats > 20), b AS (status = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'seats > 20' },
          { name: 'b', where: "status = 'open'" },
        ],
        finalWhere: 'fee = 0',
      },
      {
        id: 'ev_cte_two5',
        label: 'WITH a AS (day = tue), b AS (seats > 5) SELECT * FROM b',
        steps: [
          { name: 'a', where: "day = 'tue'" },
          { name: 'b', where: 'seats > 5' },
        ],
        finalWhere: "status = 'closed'",
      },
    ],
  },
  {
    id: 'courses',
    mode: 'pipeline',
    title: '講座',
    columns: ['title', 'level', 'hours', 'price', 'state'],
    similarColumns: [['hours', 'price']],
    rows: [
      { id: 1, title: 'SQL基礎', level: 'beginner', hours: 6, price: 12000, state: 'open' },
      { id: 2, title: 'SQL応用', level: 'advanced', hours: 12, price: 24000, state: 'open' },
      { id: 3, title: 'DB設計', level: 'advanced', hours: 10, price: 20000, state: 'closed' },
      { id: 4, title: '集計入門', level: 'beginner', hours: 4, price: 8000, state: 'open' },
      { id: 5, title: '性能改善', level: 'expert', hours: 16, price: 40000, state: 'open' },
      { id: 6, title: '運用', level: 'advanced', hours: 8, price: 16000, state: 'closed' },
      { id: 7, title: '分析', level: 'expert', hours: 20, price: 50000, state: 'open' },
      { id: 8, title: '入門2', level: 'beginner', hours: 3, price: 6000, state: 'open' },
    ],
    candidates: [
      { id: 'co_beginner', label: "level = 'beginner'", sql: "level = 'beginner'" },
      { id: 'co_advanced', label: "level = 'advanced'", sql: "level = 'advanced'" },
      { id: 'co_expert', label: "level = 'expert'", sql: "level = 'expert'" },
      { id: 'co_open', label: "state = 'open'", sql: "state = 'open'" },
      { id: 'co_closed', label: "state = 'closed'", sql: "state = 'closed'" },
      { id: 'co_hours_gt8', label: 'hours > 8', sql: 'hours > 8' },
      { id: 'co_price_gt20000', label: 'price > 20000', sql: 'price > 20000' },
    ],
    pipelines: [
      {
        id: 'co_cte_open',
        label: 'WITH open_c AS (state = open) SELECT * FROM open_c WHERE hours > 8',
        steps: [{ name: 'open_c', where: "state = 'open'" }],
        finalWhere: 'hours > 8',
      },
      {
        id: 'co_cte_beginner',
        label: 'WITH beg AS (level = beginner) SELECT * FROM beg WHERE price > 6000',
        steps: [{ name: 'beg', where: "level = 'beginner'" }],
        finalWhere: 'price > 6000',
      },
      {
        id: 'co_cte_adv',
        label: 'WITH adv AS (level = advanced) SELECT * FROM adv WHERE state = open',
        steps: [{ name: 'adv', where: "level = 'advanced'" }],
        finalWhere: "state = 'open'",
      },
      {
        id: 'co_cte_expert',
        label: 'WITH exp AS (level = expert) SELECT * FROM exp WHERE hours > 15',
        steps: [{ name: 'exp', where: "level = 'expert'" }],
        finalWhere: 'hours > 15',
      },
      {
        id: 'co_cte_long',
        label: 'WITH long_c AS (hours > 8) SELECT * FROM long_c WHERE state = open',
        steps: [{ name: 'long_c', where: 'hours > 8' }],
        finalWhere: "state = 'open'",
      },
      {
        id: 'co_cte_cheap',
        label: 'WITH cheap AS (price < 20000) SELECT * FROM cheap WHERE state = open',
        steps: [{ name: 'cheap', where: 'price < 20000' }],
        finalWhere: "state = 'open'",
      },
      {
        id: 'co_cte_two',
        label: 'WITH a AS (state = open), b AS (hours > 8) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'open'" },
          { name: 'b', where: 'hours > 8' },
        ],
        finalWhere: "level = 'expert'",
      },
      {
        id: 'co_cte_two2',
        label: 'WITH a AS (level = advanced), b AS (state = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: "level = 'advanced'" },
          { name: 'b', where: "state = 'open'" },
        ],
        finalWhere: 'hours > 10',
      },
      {
        id: 'co_cte_two3',
        label: 'WITH a AS (price > 10000), b AS (state = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'price > 10000' },
          { name: 'b', where: "state = 'open'" },
        ],
        finalWhere: 'hours > 8',
      },
      {
        id: 'co_cte_two4',
        label: 'WITH a AS (hours > 5), b AS (level = beginner) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'hours > 5' },
          { name: 'b', where: "level = 'beginner'" },
        ],
        finalWhere: "state = 'open'",
      },
      {
        id: 'co_cte_two5',
        label: 'WITH a AS (level = expert), b AS (state = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: "level = 'expert'" },
          { name: 'b', where: "state = 'open'" },
        ],
        finalWhere: 'price > 40000',
      },
      {
        id: 'co_cte_two6',
        label: 'WITH a AS (state = open), b AS (price > 15000) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'open'" },
          { name: 'b', where: 'price > 15000' },
        ],
        finalWhere: 'hours > 10',
      },
      {
        id: 'co_cte_two7',
        label: 'WITH a AS (hours >= 10), b AS (state = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'hours >= 10' },
          { name: 'b', where: "state = 'open'" },
        ],
        finalWhere: "level = 'expert'",
      },
      {
        id: 'co_cte_two8',
        label: 'WITH a AS (level = beginner), b AS (state = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: "level = 'beginner'" },
          { name: 'b', where: "state = 'open'" },
        ],
        finalWhere: 'hours > 4',
      },
      {
        id: 'co_cte_two9',
        label: 'WITH a AS (price < 25000), b AS (hours > 5) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'price < 25000' },
          { name: 'b', where: 'hours > 5' },
        ],
        finalWhere: "state = 'open'",
      },
      {
        id: 'co_cte_two10',
        label: 'WITH a AS (state = open), b AS (hours >= 10) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'open'" },
          { name: 'b', where: 'hours >= 10' },
        ],
        finalWhere: 'price > 20000',
      },
      {
        id: 'co_cte_two11',
        label: 'WITH a AS (level = advanced), b AS (hours > 8) SELECT * FROM b',
        steps: [
          { name: 'a', where: "level = 'advanced'" },
          { name: 'b', where: 'hours > 8' },
        ],
        finalWhere: "state = 'open'",
      },
      {
        id: 'co_cte_two12',
        label: 'WITH a AS (price >= 12000), b AS (state = open) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'price >= 12000' },
          { name: 'b', where: "state = 'open'" },
        ],
        finalWhere: 'hours > 5',
      },
      {
        id: 'co_cte_two13',
        label: 'WITH a AS (hours > 3), b AS (price > 10000) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'hours > 3' },
          { name: 'b', where: 'price > 10000' },
        ],
        finalWhere: "level = 'beginner'",
      },
      {
        id: 'co_cte_two14',
        label: 'WITH a AS (state = open), b AS (level = advanced) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'open'" },
          { name: 'b', where: "level = 'advanced'" },
        ],
        finalWhere: 'hours > 10',
      },
      {
        id: 'co_cte_two15',
        label: 'WITH a AS (price > 5000), b AS (hours < 10) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'price > 5000' },
          { name: 'b', where: 'hours < 10' },
        ],
        finalWhere: "state = 'open'",
      },
    ],
  },
  {
    id: 'rooms',
    mode: 'pipeline',
    title: '会議室',
    columns: ['name', 'floor', 'seats', 'rate', 'state'],
    similarColumns: [['seats', 'rate']],
    rows: [
      { id: 1, name: 'A', floor: 1, seats: 4, rate: 2000, state: 'free' },
      { id: 2, name: 'B', floor: 1, seats: 8, rate: 4000, state: 'used' },
      { id: 3, name: 'C', floor: 2, seats: 12, rate: 6000, state: 'free' },
      { id: 4, name: 'D', floor: 2, seats: 20, rate: 10000, state: 'used' },
      { id: 5, name: 'E', floor: 3, seats: 6, rate: 3000, state: 'free' },
      { id: 6, name: 'F', floor: 3, seats: 30, rate: 15000, state: 'free' },
      { id: 7, name: 'G', floor: 1, seats: 2, rate: 1000, state: 'used' },
      { id: 8, name: 'H', floor: 2, seats: 10, rate: 5000, state: 'free' },
    ],
    candidates: [
      { id: 'rm_free', label: "state = 'free'", sql: "state = 'free'" },
      { id: 'rm_used', label: "state = 'used'", sql: "state = 'used'" },
      { id: 'rm_f1', label: 'floor = 1', sql: 'floor = 1' },
      { id: 'rm_f2', label: 'floor = 2', sql: 'floor = 2' },
      { id: 'rm_seats_gt8', label: 'seats > 8', sql: 'seats > 8' },
      { id: 'rm_rate_gt4000', label: 'rate > 4000', sql: 'rate > 4000' },
    ],
    pipelines: [
      {
        id: 'rm_cte_free',
        label: 'WITH free_r AS (state = free) SELECT * FROM free_r WHERE seats > 8',
        steps: [{ name: 'free_r', where: "state = 'free'" }],
        finalWhere: 'seats > 8',
      },
      {
        id: 'rm_cte_f1',
        label: 'WITH f1 AS (floor = 1) SELECT * FROM f1 WHERE state = free',
        steps: [{ name: 'f1', where: 'floor = 1' }],
        finalWhere: "state = 'free'",
      },
      {
        id: 'rm_cte_f2',
        label: 'WITH f2 AS (floor = 2) SELECT * FROM f2 WHERE seats > 8',
        steps: [{ name: 'f2', where: 'floor = 2' }],
        finalWhere: 'seats > 8',
      },
      {
        id: 'rm_cte_big',
        label: 'WITH big AS (seats > 8) SELECT * FROM big WHERE state = free',
        steps: [{ name: 'big', where: 'seats > 8' }],
        finalWhere: "state = 'free'",
      },
      {
        id: 'rm_cte_cheap',
        label: 'WITH cheap AS (rate < 5000) SELECT * FROM cheap WHERE state = free',
        steps: [{ name: 'cheap', where: 'rate < 5000' }],
        finalWhere: "state = 'free'",
      },
      {
        id: 'rm_cte_used',
        label: 'WITH used_r AS (state = used) SELECT * FROM used_r WHERE seats > 4',
        steps: [{ name: 'used_r', where: "state = 'used'" }],
        finalWhere: 'seats > 4',
      },
      {
        id: 'rm_cte_two',
        label: 'WITH a AS (state = free), b AS (seats > 8) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'free'" },
          { name: 'b', where: 'seats > 8' },
        ],
        finalWhere: 'floor = 2',
      },
      {
        id: 'rm_cte_two2',
        label: 'WITH a AS (floor = 1), b AS (state = free) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'floor = 1' },
          { name: 'b', where: "state = 'free'" },
        ],
        finalWhere: 'seats > 4',
      },
      {
        id: 'rm_cte_two3',
        label: 'WITH a AS (rate > 3000), b AS (state = free) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'rate > 3000' },
          { name: 'b', where: "state = 'free'" },
        ],
        finalWhere: 'seats > 8',
      },
      {
        id: 'rm_cte_two4',
        label: 'WITH a AS (seats > 4), b AS (floor = 2) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'seats > 4' },
          { name: 'b', where: 'floor = 2' },
        ],
        finalWhere: "state = 'free'",
      },
      {
        id: 'rm_cte_two5',
        label: 'WITH a AS (state = free), b AS (rate > 4000) SELECT * FROM b',
        steps: [
          { name: 'a', where: "state = 'free'" },
          { name: 'b', where: 'rate > 4000' },
        ],
        finalWhere: 'seats > 8',
      },
      {
        id: 'rm_cte_two6',
        label: 'WITH a AS (floor = 3), b AS (state = free) SELECT * FROM b',
        steps: [
          { name: 'a', where: 'floor = 3' },
          { name: 'b', where: "state = 'free'" },
        ],
        finalWhere: 'seats > 8',
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
