import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../src/config.js';
import { DATASETS } from '../src/data.js';
import { createDatabase, openEngine, signatureOf } from '../src/engine.js';
import { buildQuestionBank, enumerateQuestions } from '../src/questions.js';

let dir;
let engine;
let bank;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'query-rush-questions-'));
  const dbPath = join(dir, 'test.db');
  createDatabase(dbPath);
  engine = openEngine(dbPath);
  bank = buildQuestionBank(engine);
});

after(() => {
  engine.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildQuestionBank', () => {
  test('問題が生成される', () => {
    assert.ok(bank.length >= 20, `生成された問題が少なすぎます: ${bank.length}`);
  });

  test('全データセットから問題が作れる', () => {
    for (const dataset of DATASETS) {
      const questions = bank.filter((q) => q.datasetId === dataset.id);
      assert.ok(questions.length > 0, `${dataset.id} から問題が作れません`);
    }
  });

  test('問題IDは一意', () => {
    const ids = bank.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('問題の生成条件', () => {
  test('絞り込み後テーブルは一意に定まる（4択のうち正解だけ）', () => {
    for (const question of bank) {
      const dataset = DATASETS.find((d) => d.id === question.datasetId);
      const signature = signatureOf(question.after, question.columns);

      for (const distractor of question.distractors) {
        const other = engine.runWhere(dataset, distractor.sql);
        assert.equal(other.ok, true, `${question.id}: ${distractor.id} が実行できない`);
        assert.notEqual(
          signatureOf(other.rows, question.columns),
          signature,
          `${question.id}: 不正解 ${distractor.id} が正解と同じ結果`,
        );
      }
    }
  });

  test('正解のWHEREは実際にその結果を生む', () => {
    for (const question of bank) {
      const dataset = DATASETS.find((d) => d.id === question.datasetId);
      const result = engine.runWhere(dataset, question.correct.sql);
      assert.equal(result.ok, true);
      assert.equal(
        signatureOf(result.rows, question.columns),
        signatureOf(question.after, question.columns),
        question.id,
      );
    }
  });

  test('表示は最大8行に収まる', () => {
    for (const question of bank) {
      assert.ok(question.before.length <= CONFIG.maxTableRows, `${question.id}: 前が多すぎる`);
      assert.ok(question.after.length <= CONFIG.maxTableRows, `${question.id}: 後が多すぎる`);
    }
  });

  test('行が実際に減っている（絞り込みになっている）', () => {
    for (const question of bank) {
      assert.ok(
        question.after.length < question.before.length,
        `${question.id}: 行が減っていない`,
      );
      assert.ok(question.after.length > 0, `${question.id}: 0行`);
    }
  });

  test('選択肢は4つ（正解1＋不正解3）', () => {
    for (const question of bank) {
      assert.equal(question.distractors.length, CONFIG.choiceCount - 1, question.id);
    }
  });

  test('不正解は正解と同じ列か似た列を使っている（惜しい）', () => {
    for (const question of bank) {
      const dataset = DATASETS.find((d) => d.id === question.datasetId);
      const correctColumn = question.correct.sql.split(/\s+/)[0];
      for (const distractor of question.distractors) {
        const column = distractor.sql.split(/\s+/)[0];
        const similar = (dataset.similarColumns ?? []).some(
          ([a, b]) =>
            (correctColumn === a && column === b) || (correctColumn === b && column === a),
        );
        assert.ok(
          column === correctColumn || similar,
          `${question.id}: ${distractor.id} が無関係な列（${column}）`,
        );
      }
    }
  });

  test('解説が1行で用意されている', () => {
    for (const question of bank) {
      assert.equal(typeof question.explanation, 'string');
      assert.ok(question.explanation.length > 0, question.id);
      assert.ok(!question.explanation.includes('\n'), `${question.id}: 解説が複数行`);
    }
  });

  test('差分は前後の行数と整合する', () => {
    for (const question of bank) {
      assert.equal(question.diff.kept.length, question.after.length, question.id);
      assert.equal(
        question.diff.kept.length + question.diff.removed.length,
        question.before.length,
        question.id,
      );
    }
  });
});

describe('enumerateQuestions', () => {
  test('全行が残る候補は正解にしない', () => {
    const dataset = DATASETS.find((d) => d.id === 'menu');
    const questions = enumerateQuestions(engine, dataset);
    for (const question of questions) {
      assert.ok(question.after.length < question.before.length, question.id);
    }
  });

  test('同じ結果になる候補が2つあるデータでは問題を作らない', () => {
    // 同一の結果を返す候補をわざと2つ入れたデータセット
    const dataset = {
      id: 'menu',
      title: 'テスト',
      columns: ['name', 'price', 'list_price', 'status', 'stock'],
      similarColumns: [['price', 'list_price']],
      rows: DATASETS.find((d) => d.id === 'menu').rows,
      candidates: [
        { id: 'dup_a', label: 'price > 1000', sql: 'price > 1000' },
        { id: 'dup_b', label: 'price > 1000', sql: 'price > 1000' },
        { id: 'other', label: 'stock > 0', sql: 'stock > 0' },
      ],
    };
    const questions = enumerateQuestions(engine, dataset);
    assert.equal(questions.length, 0);
  });
});
