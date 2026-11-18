import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatChoiceLabel, joinTokens, tokenizeLabel } from '../public/format.js';

describe('tokenizeLabel', () => {
  test('文字列リテラルを1トークンとして扱う', () => {
    const tokens = tokenizeLabel("status = 'served'");
    assert.deepEqual(
      tokens.map((t) => t.value),
      ['status', '=', "'served'"],
    );
  });

  test('エスケープされたクォートを含む文字列を壊さない', () => {
    const tokens = tokenizeLabel("name = 'it''s'");
    assert.equal(tokens[2].value, "'it''s'");
  });

  test('2文字の演算子を分割しない', () => {
    const tokens = tokenizeLabel('price >= 1000');
    assert.deepEqual(tokens.map((t) => t.value), ['price', '>=', '1000']);
  });
});

describe('joinTokens', () => {
  test('括弧とカンマの前後の空白を詰める', () => {
    const tokens = tokenizeLabel("COUNT ( * ) , x");
    assert.equal(joinTokens(tokens), 'COUNT(*), x');
  });
});

describe('formatChoiceLabel', () => {
  test('短いラベルは1行のまま', () => {
    assert.equal(formatChoiceLabel('price > 1000'), 'price > 1000');
    assert.equal(formatChoiceLabel('GROUP BY category'), 'GROUP BY category');
  });

  test('空文字は空のまま', () => {
    assert.equal(formatChoiceLabel(''), '');
    assert.equal(formatChoiceLabel(null), '');
  });

  test('長い複合条件は AND で改行する', () => {
    const out = formatChoiceLabel("score >= 80 AND subject = 'math' AND attempts > 2");
    assert.ok(out.includes('\n'), out);
    assert.equal(out.split('\n').length, 3);
  });

  test('括弧の中の OR では改行しない', () => {
    const out = formatChoiceLabel(
      "score >= 80 AND (subject = 'math' OR subject = 'science')",
    );
    // 外側の AND だけで割る（括弧の中は1行に保つ）
    const lines = out.split('\n');
    assert.equal(lines.length, 2, out);
    assert.ok(lines[1].includes("(subject = 'math' OR subject = 'science')"), out);
  });

  test('CASE の WHEN / ELSE / END を字下げして改行する', () => {
    const out = formatChoiceLabel(
      "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'A'",
    );
    const lines = out.split('\n');
    assert.ok(lines.length >= 4, out);
    assert.ok(lines[0].startsWith('CASE'), out);
    assert.ok(lines[1].startsWith('  WHEN'), out);
    assert.ok(lines.some((line) => line.startsWith('  ELSE')), out);
    assert.ok(lines.some((line) => line.startsWith('END')), out);
  });

  test('CASE の THEN の後で改行し、結果を字下げする', () => {
    const out = formatChoiceLabel(
      "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'A'",
    );
    const lines = out.split('\n');
    // WHEN 条件と THEN の結果が同じ行に詰め込まれない
    assert.ok(lines.some((line) => line.trim().endsWith('THEN')), out);
    assert.ok(lines.some((line) => line.startsWith("    'A'")), out);
    assert.ok(lines.some((line) => line.startsWith("    'B'")), out);
  });

  test('WITH / SELECT / FROM / WHERE で改行する', () => {
    const out = formatChoiceLabel(
      'WITH high AS (score >= 80) SELECT * FROM high WHERE active = 1',
    );
    const lines = out.split('\n');
    assert.ok(lines.length >= 4, out);
    assert.ok(lines[0].startsWith('WITH'), out);
    assert.ok(lines.some((line) => line.startsWith('SELECT')), out);
    assert.ok(lines.some((line) => line.startsWith('FROM')), out);
    assert.ok(lines.some((line) => line.startsWith('WHERE')), out);
  });

  test('文字列リテラルの中では改行しない', () => {
    const out = formatChoiceLabel("note = 'a AND b OR c' AND score > 10");
    // 文字列の中の AND / OR では割らない
    assert.ok(out.includes("'a AND b OR c'"), out);
  });

  test('整形しても内容（トークン列）は変わらない', () => {
    const labels = [
      "score >= 80 AND (subject = 'math' OR subject = 'science')",
      "CASE WHEN temp >= 32 THEN 'A' WHEN temp >= 25 THEN 'B' ELSE 'C' END = 'A'",
      'WITH high AS (score >= 80) SELECT * FROM high WHERE active = 1',
      "status IN ('served', 'pending') AND price > 1000",
    ];
    for (const label of labels) {
      const formatted = formatChoiceLabel(label);
      const before = tokenizeLabel(label).map((t) => t.value);
      const after = tokenizeLabel(formatted).map((t) => t.value);
      assert.deepEqual(after, before, label);
    }
  });
});
