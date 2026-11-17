import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_FUNCTIONS,
  hasAggregate,
  parseExpression,
  renderAst,
  safeExpression,
  tokenize,
  validateAst,
} from '../src/sql.js';

const COLUMNS = ['price', 'list_price', 'status', 'stock', 'name', 'score', 'attempts'];

describe('tokenize', () => {
  test('数値・文字列・識別子・演算子を分割する', () => {
    const tokens = tokenize("price >= 1000 AND status = 'served'");
    assert.deepEqual(
      tokens.map((t) => t.type),
      ['ident', 'op', 'number', 'keyword', 'ident', 'op', 'string'],
    );
  });

  test('セミコロン・コメント・バッククォートを拒否する', () => {
    for (const input of [
      'price > 1; DROP TABLE x',
      'price > 1 -- comment',
      'price > 1 /* c */',
      'price > 1 `x`',
      'price > 1 \\',
    ]) {
      assert.throws(() => tokenize(input), /許可されない|コメント/, input);
    }
  });

  test('閉じていない文字列を拒否する', () => {
    assert.throws(() => tokenize("status = 'served"), /閉じていません/);
  });

  test('不正な数値を拒否する', () => {
    assert.throws(() => tokenize('price > 1.2.3'), /数値の形式/);
  });
});

describe('parseExpression', () => {
  test('単一比較', () => {
    const ast = parseExpression('price > 1000', COLUMNS);
    assert.equal(ast.type, 'compare');
    assert.equal(ast.op, '>');
    assert.equal(ast.left.name, 'PRICE');
  });

  test('AND / OR の優先順位（ANDが先）', () => {
    const ast = parseExpression('a > 1 OR b > 2 AND c > 3', ['a', 'b', 'c']);
    assert.equal(ast.type, 'or');
    assert.equal(ast.items[1].type, 'and');
  });

  test('括弧で優先順位を変えられる', () => {
    const ast = parseExpression('(a > 1 OR b > 2) AND c > 3', ['a', 'b', 'c']);
    assert.equal(ast.type, 'and');
    assert.equal(ast.items[0].type, 'or');
  });

  test('NOT', () => {
    const ast = parseExpression('NOT (price > 1000)', COLUMNS);
    assert.equal(ast.type, 'not');
  });

  test('IS NULL / IS NOT NULL', () => {
    assert.equal(parseExpression('stock IS NULL', COLUMNS).type, 'isNull');
    assert.equal(parseExpression('stock IS NOT NULL', COLUMNS).negated, true);
  });

  test('IN / NOT IN', () => {
    const ast = parseExpression("status IN ('served', 'pending')", COLUMNS);
    assert.equal(ast.type, 'in');
    assert.equal(ast.values.length, 2);
    assert.equal(parseExpression("status NOT IN ('served')", COLUMNS).negated, true);
  });

  test('BETWEEN / NOT BETWEEN', () => {
    const ast = parseExpression('price BETWEEN 300 AND 1000', COLUMNS);
    assert.equal(ast.type, 'between');
    assert.equal(ast.low.value, 300);
    assert.equal(ast.high.value, 1000);
  });

  test('LIKE', () => {
    const ast = parseExpression("name LIKE 'ま%'", COLUMNS);
    assert.equal(ast.type, 'like');
    assert.equal(ast.pattern.value, 'ま%');
  });

  test('CASE WHEN', () => {
    const ast = parseExpression(
      "CASE WHEN score >= 80 THEN 'A' WHEN score >= 60 THEN 'B' ELSE 'C' END = 'A'",
      COLUMNS,
    );
    assert.equal(ast.type, 'compare');
    assert.equal(ast.left.type, 'case');
    assert.equal(ast.left.whens.length, 2);
    assert.equal(ast.left.else.value, 'C');
  });

  test('COALESCE / NULLIF', () => {
    assert.equal(parseExpression('COALESCE(price, 0) > 500', COLUMNS).left.type, 'call');
    assert.equal(parseExpression('NULLIF(price, 0) IS NULL', COLUMNS).item.type, 'call');
  });

  test('EXISTS は SELECT 1 のみ許可', () => {
    const ast = parseExpression('EXISTS (SELECT 1 FROM menu WHERE price > 100)', COLUMNS);
    assert.equal(ast.type, 'exists');
    assert.throws(
      () => parseExpression('EXISTS (SELECT price FROM menu WHERE price > 100)', COLUMNS),
      /SELECT 1 のみ/,
    );
  });

  test('許可されていない列を拒否する', () => {
    assert.throws(() => parseExpression('unknown_col > 1', COLUMNS), /許可されていない列/);
  });

  test('許可されていない関数を拒否する', () => {
    assert.throws(() => parseExpression('EVIL(price) > 1', COLUMNS), /許可されていない関数/);
  });

  test('途中で終わる式を拒否する', () => {
    assert.throws(() => parseExpression('price > 1000 AND', COLUMNS), /途中で終わって/);
  });

  test('比較演算子の無い式を拒否する', () => {
    assert.throws(() => parseExpression('price', COLUMNS), /比較演算子/);
  });
});

describe('validateAst', () => {
  test('許可されたASTは通る', () => {
    const ast = parseExpression('price > 1000', COLUMNS);
    assert.doesNotThrow(() => validateAst(ast, COLUMNS));
  });

  test('許可されていないノードを拒否する', () => {
    assert.throws(() => validateAst({ type: 'evil' }, COLUMNS), /許可されていない式/);
  });

  test('許可されていないテーブルを拒否する', () => {
    const ast = parseExpression('EXISTS (SELECT 1 FROM menu WHERE price > 1)', COLUMNS);
    assert.throws(() => validateAst(ast, COLUMNS, ['other']), /許可されていないテーブル/);
  });
});

describe('renderAst', () => {
  test('ASTからSQLを再生成する（元の文字列を使わない）', () => {
    const { sql } = safeExpression("status = 'served' AND price > 1000", COLUMNS);
    assert.equal(sql, "STATUS = 'served' AND PRICE > 1000");
  });

  test('文字列リテラルのクォートをエスケープする', () => {
    const { sql } = safeExpression("name = 'it''s'", COLUMNS);
    assert.equal(sql, "NAME = 'it''s'");
  });

  test('NOT の括弧を補う', () => {
    const { sql } = safeExpression('NOT (price > 1000)', COLUMNS);
    assert.equal(sql, 'NOT (PRICE > 1000)');
  });

  test('OR を AND の中に入れるとき括弧を補う', () => {
    const { sql } = safeExpression('(a > 1 OR b > 2) AND c > 3', ['a', 'b', 'c']);
    assert.equal(sql, '(A > 1 OR B > 2) AND C > 3');
  });

  test('CASE を再生成する', () => {
    const { sql } = safeExpression("CASE WHEN score >= 80 THEN 'A' ELSE 'B' END = 'A'", COLUMNS);
    assert.equal(sql, "CASE WHEN SCORE >= 80 THEN 'A' ELSE 'B' END = 'A'");
  });
});

describe('safeExpression', () => {
  test('解析→検証→再生成を通す', () => {
    const result = safeExpression('price BETWEEN 300 AND 1000', COLUMNS);
    assert.equal(result.sql, 'PRICE BETWEEN 300 AND 1000');
    assert.equal(result.ast.type, 'between');
  });

  test('危険な入力はすべて拒否する', () => {
    const bad = [
      'price > 1000; DROP TABLE menu',
      'price > 1000 -- x',
      'price > 1000 /* x */',
      'unknown > 1',
      'EVIL(price) > 1',
      'price > 1000 AND',
      '',
    ];
    for (const input of bad) {
      assert.throws(() => safeExpression(input, COLUMNS), undefined, input);
    }
  });
});

describe('hasAggregate', () => {
  test('集計関数を検出する', () => {
    assert.equal(hasAggregate(parseExpression('COUNT(*) > 1', [])), true);
    assert.equal(hasAggregate(parseExpression('SUM(price) > 1', COLUMNS)), true);
    assert.equal(hasAggregate(parseExpression('price > 1', COLUMNS)), false);
  });
});

describe('ALLOWED_FUNCTIONS', () => {
  test('集計・変換・文字列関数を含む', () => {
    for (const name of ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'UPPER', 'LOWER']) {
      assert.ok(ALLOWED_FUNCTIONS.has(name), name);
    }
  });

  test('危険な関数を含まない', () => {
    for (const name of ['LOAD_EXTENSION', 'READFILE', 'WRITEFILE', 'EVAL']) {
      assert.ok(!ALLOWED_FUNCTIONS.has(name), name);
    }
  });
});
