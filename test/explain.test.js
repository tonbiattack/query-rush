import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { explainWrongChoice, reasonOf } from '../public/explain.js';

describe('reasonOf', () => {
  test('境界（> と >=）の違いを検出する', () => {
    assert.match(reasonOf('price > 1000', 'price >= 1000'), /境界/);
    assert.match(reasonOf('price >= 1000', 'price > 1000'), /境界/);
    assert.match(reasonOf('qty < 3', 'qty <= 3'), /境界/);
  });

  test('NULL の扱いの違いを検出する', () => {
    assert.match(reasonOf('stock IS NULL', 'stock IS NOT NULL'), /NULL/);
    assert.match(reasonOf('stock IS NOT NULL', 'stock IS NULL'), /NULL/);
  });

  test('条件の反転を検出する', () => {
    assert.match(reasonOf("status = 'paid'", "status != 'paid'"), /反転/);
  });

  test('集計関数の取り違えを検出する', () => {
    assert.match(reasonOf('SUM(amount)', 'AVG(amount)'), /SUM と AVG/);
  });

  test('COUNT(*) と COUNT(列) の違いを検出する', () => {
    assert.match(reasonOf('COUNT(*)', 'COUNT(amount)'), /COUNT/);
  });

  test('列の取り違えを検出する', () => {
    assert.match(reasonOf('price > 1000', 'list_price > 1000'), /列の取り違え/);
  });

  test('GROUP BY の列の違いを検出する', () => {
    assert.match(reasonOf('GROUP BY category', 'GROUP BY region'), /グループ化/);
  });

  test('違いが分からなければ null', () => {
    assert.equal(reasonOf('price > 1000', 'price > 1000'), null);
  });
});

describe('explainWrongChoice', () => {
  const question = {
    correct: { id: 'a', label: 'price > 1000' },
    distractors: [
      { id: 'b', label: 'price >= 1000' },
      { id: 'c', label: 'price < 400' },
    ],
    distractorPreviews: {
      b: { rows: [], extra: [1, 2], missing: [] },
      c: { rows: [], extra: [], missing: [3] },
    },
  };

  test('増えた行の数を示す', () => {
    const text = explainWrongChoice(question, 'b');
    assert.match(text, /2行多い/);
    assert.match(text, /境界/);
  });

  test('足りない行の数を示す', () => {
    const text = explainWrongChoice(question, 'c');
    assert.match(text, /1行足りない/);
  });

  test('増減が両方あれば両方示す', () => {
    const q = {
      ...question,
      distractorPreviews: { b: { rows: [], extra: [1], missing: [2] } },
    };
    const text = explainWrongChoice(q, 'b');
    assert.match(text, /1行多く/);
    assert.match(text, /1行足りない/);
  });

  test('増減がなければ「中身が違う」と言う', () => {
    const q = {
      ...question,
      distractorPreviews: { b: { rows: [], extra: [], missing: [] } },
    };
    assert.match(explainWrongChoice(q, 'b'), /中身が違う/);
  });

  test('プレビューが無ければ null', () => {
    assert.equal(explainWrongChoice(question, 'unknown'), null);
  });

  test('存在しない選択肢なら null', () => {
    const q = { ...question, distractorPreviews: { zzz: { rows: [], extra: [], missing: [] } } };
    assert.equal(explainWrongChoice(q, 'zzz'), null);
  });
});
