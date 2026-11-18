/**
 * 選択肢ラベルの整形（Issue #18）。
 *
 * 長いSQLを1行で折り返すと読みにくいので、SQLの区切りで改行を入れる。
 * 表示専用の処理で、判定には使わない（判定は choice.id で行う）。
 *
 * 方針:
 *  - 短いラベルはそのまま1行（改行すると逆に読みにくい）
 *  - 句の区切り（WITH / SELECT / FROM / WHERE / GROUP BY / ORDER BY / HAVING）で改行
 *  - CASE の WHEN / ELSE は字下げ、END は CASE と同じ高さ
 *  - AND / OR は括弧の外側だけ改行（括弧の中まで割ると読みにくい）
 *  - 文字列リテラルの中は絶対に割らない
 */

/** 改行を入れる最小の長さ。これ以下は1行のまま */
const BREAK_THRESHOLD = 28;

/** 句の先頭になるキーワード */
const CLAUSE_KEYWORDS = new Set(['WITH', 'SELECT', 'FROM', 'WHERE', 'HAVING']);

/** 2語で1つの句になるキーワード（GROUP BY / ORDER BY） */
const PAIR_KEYWORDS = new Set(['GROUP', 'ORDER']);

/** 論理演算子 */
const BOOLEAN_KEYWORDS = new Set(['AND', 'OR']);

/** CASE の区切り */
const CASE_KEYWORDS = new Set(['WHEN', 'ELSE', 'END']);

/** THEN の後で改行する（WHEN 条件と結果を分けて読みやすくする） */
const THEN_KEYWORD = 'THEN';

/**
 * ラベルをトークンに分ける。
 * 文字列リテラル（'' エスケープを含む）は1つのトークンとして扱う。
 */
export function tokenizeLabel(text) {
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // 文字列リテラル
    if (ch === "'") {
      let j = i + 1;
      let value = "'";
      while (j < text.length) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            value += "''";
            j += 2;
            continue;
          }
          value += "'";
          j += 1;
          break;
        }
        value += text[j];
        j += 1;
      }
      tokens.push({ type: 'string', value });
      i = j;
      continue;
    }

    // 識別子・キーワード
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j += 1;
      tokens.push({ type: 'word', value: text.slice(i, j) });
      i = j;
      continue;
    }

    // 数値
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9.]/.test(text[j])) j += 1;
      tokens.push({ type: 'number', value: text.slice(i, j) });
      i = j;
      continue;
    }

    // 2文字の演算子
    const twoChar = ['>=', '<=', '!=', '<>'].find((op) => text.startsWith(op, i));
    if (twoChar) {
      tokens.push({ type: 'op', value: twoChar });
      i += twoChar.length;
      continue;
    }

    tokens.push({ type: 'punct', value: ch });
    i += 1;
  }

  return tokens;
}

/** 関数呼び出しとみなす識別子（この直後の `(` だけ空白を詰める） */
const FUNCTION_NAMES = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'COALESCE', 'NULLIF', 'ABS', 'ROUND', 'LENGTH', 'UPPER', 'LOWER',
]);

/** トークンを1行に戻す（括弧・カンマの前後の空白を詰める） */
export function joinTokens(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const prev = tokens[i - 1];

    const noSpaceBefore = token.type === 'punct' && [')', ',', '.'].includes(token.value);
    const noSpaceAfterPrev = prev && prev.type === 'punct' && ['(', '.'].includes(prev.value);
    // 関数呼び出しの括弧だけ詰める（AND ( ... ) や AS ( ... ) は空白を残す）
    const isCallParen =
      token.type === 'punct' &&
      token.value === '(' &&
      prev &&
      prev.type === 'word' &&
      FUNCTION_NAMES.has(prev.value.toUpperCase());

    if (out && !noSpaceBefore && !noSpaceAfterPrev && !isCallParen) out += ' ';
    out += token.value;
  }
  return out;
}

/**
 * 選択肢ラベルを読みやすく整形する。
 * @param {string} label
 * @returns {string} 改行を含む表示用の文字列
 */
export function formatChoiceLabel(label) {
  const text = String(label ?? '').trim();
  if (text.length === 0) return '';
  // 短いラベルは1行のまま（改行すると逆に読みにくい）
  if (text.length <= BREAK_THRESHOLD) return text;

  const tokens = tokenizeLabel(text);
  const lines = [];
  let current = [];
  let depth = 0;
  let pendingIndent = '';

  const flush = () => {
    if (current.length === 0) return;
    lines.push(pendingIndent + joinTokens(current));
    current = [];
    pendingIndent = '';
  };

  for (const token of tokens) {
    // 括弧の深さを追う（AND/OR を外側だけで割るため）
    if (token.type === 'punct' && token.value === '(') depth += 1;
    if (token.type === 'punct' && token.value === ')') depth = Math.max(0, depth - 1);

    let breakBefore = false;
    let indent = '';

    if (token.type === 'word' && current.length > 0) {
      const upper = token.value.toUpperCase();

      if (CLAUSE_KEYWORDS.has(upper)) {
        breakBefore = true;
      } else if (PAIR_KEYWORDS.has(upper) && depth === 0) {
        breakBefore = true;
      } else if (BOOLEAN_KEYWORDS.has(upper) && depth === 0) {
        breakBefore = true;
      } else if (upper === 'WHEN' || upper === 'ELSE') {
        breakBefore = true;
        indent = '  ';
      } else if (upper === 'END') {
        breakBefore = true;
      }
    }

    if (breakBefore) flush();
    if (indent && current.length === 0) pendingIndent = indent;
    current.push(token);

    // THEN の直後で改行し、結果を次の行に置く（WHEN 条件と分離する）
    if (token.type === 'word' && token.value.toUpperCase() === THEN_KEYWORD) {
      flush();
      pendingIndent = '    ';
    }
  }
  flush();

  return lines.join('\n');
}
