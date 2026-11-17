/**
 * SQL式の安全なパーサー（Issue #9 の「許可制ASTへの置換」）。
 *
 * 文字列をそのままSQLへ流さない。字句解析 → 構文解析 → AST検証 → ASTから再生成、
 * の順に通し、許可したノードだけを実行する。これにより
 *  - コメント・セミコロン・複数文の混入
 *  - 許可していない関数・句
 *  - 想定外の列名
 * を、実行前にすべて弾ける。
 *
 * 対応する構文（Filter / Logic / Aggregate / Pipeline で使う範囲）:
 *   比較        = != <> > >= < <=
 *   論理        AND / OR / NOT、括弧
 *   NULL        IS NULL / IS NOT NULL
 *   集合        IN / NOT IN
 *   範囲        BETWEEN / NOT BETWEEN
 *   パターン    LIKE / NOT LIKE
 *   存在        EXISTS / NOT EXISTS（副問い合わせは1テーブル・WHEREのみ）
 *   分岐        CASE WHEN ... THEN ... ELSE ... END
 *   関数        COALESCE / NULLIF / COUNT / SUM / AVG / MIN / MAX / ABS / ROUND / LENGTH / UPPER / LOWER
 */

/** 許可する関数（大文字） */
export const ALLOWED_FUNCTIONS = new Set([
  'COALESCE',
  'NULLIF',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'ABS',
  'ROUND',
  'LENGTH',
  'UPPER',
  'LOWER',
]);

/** 集計関数（GROUP BY と組み合わせる） */
export const AGGREGATE_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

const KEYWORDS = new Set([
  'AND', 'OR', 'NOT', 'IS', 'NULL', 'IN', 'BETWEEN', 'LIKE', 'EXISTS',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'SELECT', 'FROM', 'WHERE',
  'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'AS', 'DISTINCT',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'WITH', 'UNION', 'ALL',
]);

const OPERATORS = ['>=', '<=', '!=', '<>', '=', '>', '<', '+', '-', '*', '/'];

/* ── 字句解析 ─────────────────────────────────────── */

/**
 * 文字列をトークン列にする。
 * 許可しない文字（セミコロン・コメント記号・バッククォート等）はここで弾く。
 */
export function tokenize(input) {
  const text = String(input ?? '');
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // 空白
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // コメント・複数文は即拒否
    if (ch === ';' || ch === '`' || ch === '\\') {
      throw new Error(`許可されない文字が含まれています: ${ch}`);
    }
    if (ch === '-' && text[i + 1] === '-') throw new Error('コメントは許可されていません');
    if (ch === '/' && text[i + 1] === '*') throw new Error('コメントは許可されていません');

    // 文字列リテラル（'' は エスケープされたシングルクォート）
    if (ch === "'") {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < text.length) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            value += "'";
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        value += text[j];
        j += 1;
      }
      if (!closed) throw new Error('文字列リテラルが閉じていません');
      tokens.push({ type: 'string', value });
      i = j;
      continue;
    }

    // 数値
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j])) j += 1;
      const raw = text.slice(i, j);
      if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(`数値の形式が不正です: ${raw}`);
      tokens.push({ type: 'number', value: Number(raw) });
      i = j;
      continue;
    }

    // 識別子・キーワード
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      const raw = text.slice(i, j);
      const upper = raw.toUpperCase();
      tokens.push({ type: KEYWORDS.has(upper) ? 'keyword' : 'ident', value: upper, raw });
      i = j;
      continue;
    }

    // 演算子
    const op = OPERATORS.find((candidate) => text.startsWith(candidate, i));
    if (op) {
      tokens.push({ type: 'op', value: op });
      i += op.length;
      continue;
    }

    // 句読点
    if (ch === '(' || ch === ')' || ch === ',' || ch === '.') {
      tokens.push({ type: 'punct', value: ch });
      i += 1;
      continue;
    }

    throw new Error(`許可されない文字が含まれています: ${ch}`);
  }

  return tokens;
}

/* ── 構文解析 ─────────────────────────────────────── */

class Parser {
  constructor(tokens, allowedColumns) {
    this.tokens = tokens;
    this.pos = 0;
    this.allowedColumns = new Set(allowedColumns.map((c) => c.toUpperCase()));
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  next() {
    const token = this.tokens[this.pos];
    this.pos += 1;
    return token;
  }

  atEnd() {
    return this.pos >= this.tokens.length;
  }

  isKeyword(word, offset = 0) {
    const token = this.peek(offset);
    return token?.type === 'keyword' && token.value === word;
  }

  isOp(value, offset = 0) {
    const token = this.peek(offset);
    return token?.type === 'op' && token.value === value;
  }

  isPunct(value, offset = 0) {
    const token = this.peek(offset);
    return token?.type === 'punct' && token.value === value;
  }

  expectKeyword(word) {
    if (!this.isKeyword(word)) throw new Error(`${word} が必要です`);
    return this.next();
  }

  expectPunct(value) {
    if (!this.isPunct(value)) throw new Error(`${value} が必要です`);
    return this.next();
  }

  /** 式全体 */
  parseExpression() {
    const expr = this.parseOr();
    if (!this.atEnd()) throw new Error('式の末尾に余分なトークンがあります');
    return expr;
  }

  parseOr() {
    const items = [this.parseAnd()];
    while (this.isKeyword('OR')) {
      this.next();
      items.push(this.parseAnd());
    }
    return items.length === 1 ? items[0] : { type: 'or', items };
  }

  parseAnd() {
    const items = [this.parseNot()];
    while (this.isKeyword('AND')) {
      this.next();
      items.push(this.parseNot());
    }
    return items.length === 1 ? items[0] : { type: 'and', items };
  }

  parseNot() {
    if (this.isKeyword('NOT')) {
      this.next();
      return { type: 'not', item: this.parseNot() };
    }
    return this.parsePrimary();
  }

  /**
   * 括弧付きの論理式か、通常の述語か。
   * `(a > 1 OR b > 2)` のような括弧は論理式として読む必要がある。
   */
  parsePrimary() {
    if (this.isPunct('(')) {
      // 括弧の中身が論理式か値かを先読みで判定する
      const saved = this.pos;
      this.next();
      try {
        const inner = this.parseOr();
        this.expectPunct(')');
        // 括弧の後ろに比較演算子が続くなら、これは値として扱う
        const after = this.peek();
        const isValueContext =
          after?.type === 'op' && ['=', '!=', '<>', '>', '>=', '<', '<='].includes(after.value);
        if (!isValueContext) return inner;
      } catch {
        // 論理式として読めなければ値として読み直す
      }
      this.pos = saved;
    }
    return this.parsePredicate();
  }

  parsePredicate() {
    // EXISTS (SELECT ... )
    if (this.isKeyword('EXISTS')) {
      this.next();
      return this.parseExists(false);
    }

    const left = this.parseValue();

    // IS [NOT] NULL
    if (this.isKeyword('IS')) {
      this.next();
      const negated = this.isKeyword('NOT');
      if (negated) this.next();
      this.expectKeyword('NULL');
      return { type: 'isNull', item: left, negated };
    }

    // [NOT] IN (...)
    if (this.isKeyword('NOT') && this.isKeyword('IN', 1)) {
      this.next();
      this.next();
      return this.parseIn(left, true);
    }
    if (this.isKeyword('IN')) {
      this.next();
      return this.parseIn(left, false);
    }

    // [NOT] BETWEEN a AND b
    if (this.isKeyword('NOT') && this.isKeyword('BETWEEN', 1)) {
      this.next();
      this.next();
      return this.parseBetween(left, true);
    }
    if (this.isKeyword('BETWEEN')) {
      this.next();
      return this.parseBetween(left, false);
    }

    // [NOT] LIKE 'pattern'
    if (this.isKeyword('NOT') && this.isKeyword('LIKE', 1)) {
      this.next();
      this.next();
      return this.parseLike(left, true);
    }
    if (this.isKeyword('LIKE')) {
      this.next();
      return this.parseLike(left, false);
    }

    // 比較
    const token = this.peek();
    if (token?.type === 'op' && ['=', '!=', '<>', '>', '>=', '<', '<='].includes(token.value)) {
      this.next();
      const right = this.parseValue();
      return { type: 'compare', op: token.value === '<>' ? '!=' : token.value, left, right };
    }

    throw new Error('比較演算子が必要です');
  }

  parseExists(negated) {
    this.expectPunct('(');
    this.expectKeyword('SELECT');
    // SELECT 1 のみ許可（列を持ち出さない）
    const selectToken = this.next();
    if (selectToken?.type !== 'number' || selectToken.value !== 1) {
      throw new Error('EXISTS の副問い合わせは SELECT 1 のみ許可します');
    }
    this.expectKeyword('FROM');
    const tableToken = this.next();
    if (tableToken?.type !== 'ident') throw new Error('EXISTS のテーブル名が不正です');
    this.expectKeyword('WHERE');
    const where = this.parseOr();
    this.expectPunct(')');
    return { type: 'exists', table: tableToken.value, where, negated };
  }

  parseIn(left, negated) {
    this.expectPunct('(');
    const values = [];
    if (!this.isPunct(')')) {
      values.push(this.parseValue());
      while (this.isPunct(',')) {
        this.next();
        values.push(this.parseValue());
      }
    }
    this.expectPunct(')');
    if (values.length === 0) throw new Error('IN の値が空です');
    return { type: 'in', item: left, values, negated };
  }

  parseBetween(left, negated) {
    const low = this.parseValue();
    this.expectKeyword('AND');
    const high = this.parseValue();
    return { type: 'between', item: left, low, high, negated };
  }

  parseLike(left, negated) {
    const pattern = this.parseValue();
    if (pattern.type !== 'literal' || pattern.kind !== 'string') {
      throw new Error('LIKE のパターンは文字列リテラルで指定してください');
    }
    return { type: 'like', item: left, pattern, negated };
  }

  /** 値（列・リテラル・関数呼び出し・CASE・括弧） */
  parseValue() {
    const token = this.peek();
    if (!token) throw new Error('式が途中で終わっています');

    // 括弧（式をまとめる）
    if (token.type === 'punct' && token.value === '(') {
      this.next();
      const inner = this.parseOr();
      this.expectPunct(')');
      return inner;
    }

    // CASE
    if (token.type === 'keyword' && token.value === 'CASE') {
      return this.parseCase();
    }

    // 数値・文字列
    if (token.type === 'number') {
      this.next();
      return { type: 'literal', kind: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.next();
      return { type: 'literal', kind: 'string', value: token.value };
    }

    // NULL リテラル
    if (token.type === 'keyword' && token.value === 'NULL') {
      this.next();
      return { type: 'literal', kind: 'null', value: null };
    }

    // 識別子（列 or 関数）
    if (token.type === 'ident') {
      this.next();
      if (this.isPunct('(')) {
        return this.parseCall(token.value);
      }
      if (!this.allowedColumns.has(token.value)) {
        throw new Error(`許可されていない列です: ${token.raw}`);
      }
      return { type: 'column', name: token.value };
    }

    throw new Error(`式として解釈できません: ${token.value}`);
  }

  parseCall(name) {
    if (!ALLOWED_FUNCTIONS.has(name)) {
      throw new Error(`許可されていない関数です: ${name}`);
    }
    this.expectPunct('(');
    const args = [];
    if (this.isPunct('*')) {
      // COUNT(*) は字句解析で * が op になる
    }
    if (this.isOp('*')) {
      this.next();
      args.push({ type: 'star' });
    } else if (!this.isPunct(')')) {
      args.push(this.parseValue());
      while (this.isPunct(',')) {
        this.next();
        args.push(this.parseValue());
      }
    }
    this.expectPunct(')');
    return { type: 'call', name, args };
  }

  parseCase() {
    this.expectKeyword('CASE');
    const whens = [];
    while (this.isKeyword('WHEN')) {
      this.next();
      const when = this.parseOr();
      this.expectKeyword('THEN');
      const then = this.parseValue();
      whens.push({ when, then });
    }
    if (whens.length === 0) throw new Error('CASE には WHEN が必要です');
    let elseValue = null;
    if (this.isKeyword('ELSE')) {
      this.next();
      elseValue = this.parseValue();
    }
    this.expectKeyword('END');
    return { type: 'case', whens, else: elseValue };
  }
}

/**
 * 式を解析してASTを返す。
 * @param {string} sql
 * @param {string[]} allowedColumns そのテーブルで使える列名
 */
export function parseExpression(sql, allowedColumns) {
  const tokens = tokenize(sql);
  if (tokens.length === 0) throw new Error('式が空です');
  const parser = new Parser(tokens, allowedColumns);
  return parser.parseExpression();
}

/* ── 検証 ─────────────────────────────────────────── */

/**
 * ASTを検証する。許可したノード種別・関数・列だけを通す。
 * パーサー側でも弾いているが、ASTを直接組み立てた場合の保険として二重に確認する。
 */
export function validateAst(node, allowedColumns, allowedTables = []) {
  const columns = new Set(allowedColumns.map((c) => c.toUpperCase()));
  const tables = new Set(allowedTables.map((t) => t.toUpperCase()));

  function walk(current) {
    if (!current || typeof current !== 'object') throw new Error('ASTが不正です');
    switch (current.type) {
      case 'column':
        if (!columns.has(current.name)) throw new Error(`許可されていない列です: ${current.name}`);
        return;
      case 'literal':
        return;
      case 'star':
        return;
      case 'compare':
        walk(current.left);
        walk(current.right);
        return;
      case 'and':
      case 'or':
        if (!Array.isArray(current.items) || current.items.length < 2) {
          throw new Error('AND/OR の項が足りません');
        }
        current.items.forEach(walk);
        return;
      case 'not':
        walk(current.item);
        return;
      case 'isNull':
        walk(current.item);
        return;
      case 'in':
        walk(current.item);
        current.values.forEach(walk);
        return;
      case 'between':
        walk(current.item);
        walk(current.low);
        walk(current.high);
        return;
      case 'like':
        walk(current.item);
        walk(current.pattern);
        return;
      case 'exists':
        if (!tables.has(current.table)) throw new Error(`許可されていないテーブルです: ${current.table}`);
        walk(current.where);
        return;
      case 'case':
        for (const entry of current.whens) {
          walk(entry.when);
          walk(entry.then);
        }
        if (current.else) walk(current.else);
        return;
      case 'call':
        if (!ALLOWED_FUNCTIONS.has(current.name)) {
          throw new Error(`許可されていない関数です: ${current.name}`);
        }
        current.args.forEach(walk);
        return;
      default:
        throw new Error(`許可されていない式です: ${current.type}`);
    }
  }

  walk(node);
  return node;
}

/* ── SQL生成 ──────────────────────────────────────── */

/** ASTからSQLを組み立てる（文字列連結ではなくノードから生成する） */
export function renderAst(node) {
  switch (node.type) {
    case 'column':
      return node.name;
    case 'literal':
      if (node.kind === 'null') return 'NULL';
      if (node.kind === 'number') return String(node.value);
      return `'${String(node.value).replace(/'/g, "''")}'`;
    case 'star':
      return '*';
    case 'compare':
      return `${renderAst(node.left)} ${node.op} ${renderAst(node.right)}`;
    case 'and':
      return node.items.map((item) => wrap(item, 'and')).join(' AND ');
    case 'or':
      return node.items.map((item) => wrap(item, 'or')).join(' OR ');
    case 'not':
      return `NOT ${wrap(node.item, 'not')}`;
    case 'isNull':
      return `${renderAst(node.item)} IS ${node.negated ? 'NOT ' : ''}NULL`;
    case 'in':
      return `${renderAst(node.item)} ${node.negated ? 'NOT ' : ''}IN (${node.values
        .map(renderAst)
        .join(', ')})`;
    case 'between':
      return `${renderAst(node.item)} ${node.negated ? 'NOT ' : ''}BETWEEN ${renderAst(node.low)} AND ${renderAst(node.high)}`;
    case 'like':
      return `${renderAst(node.item)} ${node.negated ? 'NOT ' : ''}LIKE ${renderAst(node.pattern)}`;
    case 'exists':
      return `${node.negated ? 'NOT ' : ''}EXISTS (SELECT 1 FROM ${node.table} WHERE ${renderAst(node.where)})`;
    case 'case': {
      const whens = node.whens
        .map((entry) => `WHEN ${renderAst(entry.when)} THEN ${renderAst(entry.then)}`)
        .join(' ');
      const elsePart = node.else ? ` ELSE ${renderAst(node.else)}` : '';
      return `CASE ${whens}${elsePart} END`;
    }
    case 'call':
      return `${node.name}(${node.args.map(renderAst).join(', ')})`;
    default:
      throw new Error(`許可されていない式です: ${node.type}`);
  }
}

/** 演算子の優先順位に合わせて括弧を補う */
function wrap(node, parent) {
  const needsParens =
    (parent === 'and' && node.type === 'or') ||
    (parent === 'not' && (node.type === 'and' || node.type === 'or' || node.type === 'compare'));
  return needsParens ? `(${renderAst(node)})` : renderAst(node);
}

/**
 * 式を安全にSQL断片へ変換する。
 * 解析 → 検証 → 再生成 の順に通すので、元の文字列はそのまま使われない。
 */
export function safeExpression(sql, allowedColumns, allowedTables = []) {
  const ast = parseExpression(sql, allowedColumns);
  validateAst(ast, allowedColumns, allowedTables);
  return { ast, sql: renderAst(ast) };
}

/** ASTに集計関数が含まれるか */
export function hasAggregate(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'call' && AGGREGATE_FUNCTIONS.has(node.name)) return true;
  return Object.values(node).some((value) => {
    if (Array.isArray(value)) return value.some((item) => hasAggregate(item));
    if (value && typeof value === 'object') return hasAggregate(value);
    return false;
  });
}
