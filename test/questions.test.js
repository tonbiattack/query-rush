import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CONFIG } from '../src/config.js';
import { allDatasets } from '../src/data.js';
import { createDatabase, openEngine, signatureOf } from '../src/engine.js';
import { MODES, MODE_ORDER, isModeId, modeOf } from '../src/modes.js';
import { buildModeBank, buildQuestionBank } from '../src/questions.js';

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

describe('modes', () => {
  test('全モードが定義されている', () => {
    for (const id of ['filter', 'advanced', 'logic', 'aggregate', 'pipeline', 'master']) {
      assert.ok(MODES[id], id);
      assert.equal(MODES[id].id, id);
    }
  });

  test('不明なモードは既定にフォールバックする', () => {
    assert.equal(isModeId('nope'), false);
    assert.equal(modeOf('nope').id, 'filter');
    assert.equal(modeOf('logic').id, 'logic');
  });

  test('モードごとに制限時間が設定されている', () => {
    for (const id of MODE_ORDER) {
      assert.ok(MODES[id].questionSeconds > 0, id);
    }
  });
});

describe('buildQuestionBank', () => {
  test('全モードで問題が生成される', () => {
    for (const id of MODE_ORDER) {
      assert.ok(bank[id].length > 0, `${id} に問題がない`);
    }
  });

  test('問題IDはモード内で一意', () => {
    for (const id of MODE_ORDER) {
      const ids = bank[id].map((q) => q.id);
      assert.equal(new Set(ids).size, ids.length, id);
    }
  });

  test('Master は他モードの問題をすべて含む', () => {
    const others = ['filter', 'advanced', 'logic', 'aggregate', 'pipeline']
      .flatMap((id) => bank[id].map((q) => q.id));
    const masterIds = new Set(bank.master.map((q) => q.id));
    for (const id of others) {
      assert.ok(masterIds.has(id), `${id} が Master に無い`);
    }
  });
});

describe('問題の生成条件', () => {
  test('表示は最大8行に収まる', () => {
    for (const id of MODE_ORDER) {
      for (const question of bank[id]) {
        assert.ok(question.before.length <= CONFIG.maxTableRows, `${question.id}: 前が多い`);
        assert.ok(question.after.length <= CONFIG.maxTableRows, `${question.id}: 後が多い`);
      }
    }
  });

  test('選択肢は4つ（正解1＋不正解3）', () => {
    for (const id of MODE_ORDER) {
      for (const question of bank[id]) {
        assert.equal(question.distractors.length, CONFIG.choiceCount - 1, question.id);
      }
    }
  });

  test('不正解は正解と同じIDでない', () => {
    for (const id of MODE_ORDER) {
      for (const question of bank[id]) {
        for (const distractor of question.distractors) {
          assert.notEqual(distractor.id, question.correct.id, question.id);
        }
      }
    }
  });

  test('解説が1行で用意されている', () => {
    for (const id of MODE_ORDER) {
      for (const question of bank[id]) {
        assert.equal(typeof question.explanation, 'string', question.id);
        assert.ok(question.explanation.length > 0, question.id);
        assert.ok(!question.explanation.includes('\n'), `${question.id}: 複数行`);
      }
    }
  });

  test('Filter は行が実際に減っている', () => {
    for (const question of bank.filter) {
      assert.ok(question.after.length < question.before.length, question.id);
      assert.ok(question.after.length > 0, question.id);
    }
  });

  test('Filter の正解は実際にその結果を生む', () => {
    for (const question of bank.filter) {
      const dataset = allDatasets().find((d) => d.id === question.datasetId);
      const result = engine.runWhere(dataset, question.correct.label);
      assert.equal(result.ok, true, question.id);
      assert.equal(
        signatureOf(result.rows, question.columns),
        signatureOf(question.after, question.columns),
        question.id,
      );
    }
  });

  test('Filter の不正解は正解と違う結果になる（一意性）', () => {
    for (const question of bank.filter) {
      const dataset = allDatasets().find((d) => d.id === question.datasetId);
      const signature = signatureOf(question.after, question.columns);
      for (const distractor of question.distractors) {
        const other = engine.runWhere(dataset, distractor.label);
        assert.equal(other.ok, true, `${question.id}: ${distractor.id}`);
        assert.notEqual(
          signatureOf(other.rows, question.columns),
          signature,
          `${question.id}: ${distractor.id} が正解と同じ結果`,
        );
      }
    }
  });

  test('Advanced は複合条件・IN・BETWEEN を含む', () => {
    const labels = bank.advanced.map((q) => q.correct.label).join(' ');
    assert.match(labels, /AND|OR/);
    assert.match(labels, /IN/);
    assert.match(labels, /BETWEEN/);
  });

  test('Advanced は LIKE または NULL 三値論理を含む', () => {
    const labels = bank.advanced.map((q) => q.correct.label).join(' ');
    assert.ok(/LIKE/.test(labels) || /IS NULL/.test(labels), labels);
  });

  test('Logic は CASE / COALESCE / NULLIF を含む', () => {
    const labels = bank.logic.map((q) => q.correct.label).join(' ');
    assert.match(labels, /CASE/);
    assert.match(labels, /COALESCE/);
    assert.match(labels, /NULLIF/);
  });

  test('Aggregate は GROUP BY と HAVING を含む', () => {
    const labels = bank.aggregate.map((q) => q.correct.label).join(' ');
    assert.match(labels, /GROUP BY/);
    assert.match(labels, /HAVING/);
  });

  test('Pipeline は CTE を含む', () => {
    for (const question of bank.pipeline) {
      assert.match(question.correct.label, /WITH/);
      assert.ok(question.stages.length > 0, question.id);
    }
  });

  test('カテゴリが設定されている（#16）', () => {
    for (const id of MODE_ORDER) {
      for (const question of bank[id]) {
        assert.ok(question.category, question.id);
      }
    }
  });
});

describe('buildModeBank', () => {
  test('不明なモードは例外', () => {
    assert.throws(() => buildModeBank(engine, 'nope'), /不明なモード/);
  });

  test('Filter は4データセットから作られる', () => {
    const datasets = new Set(bank.filter.map((q) => q.datasetId));
    assert.ok(datasets.size >= 4);
  });
});

describe('engine', () => {
  test('読み取り専用で開くので書き込みできない', () => {
    const ro = new DatabaseSync(join(dir, 'test.db'), { readOnly: true });
    assert.throws(() => ro.exec("INSERT INTO menu (name) VALUES ('x')"), /readonly|read-only/i);
    ro.close();
  });

  test('危険な式は実行前に拒否する', () => {
    const dataset = allDatasets().find((d) => d.id === 'menu');
    for (const where of [
      'price > 1000; DROP TABLE menu',
      'price > 1000 -- x',
      'unknown_col > 1',
      'EVIL(price) > 1',
    ]) {
      const result = engine.runWhere(dataset, where);
      assert.equal(result.ok, false, where);
      assert.ok(result.error, where);
    }
  });

  test('前後差分を返す', () => {
    const dataset = allDatasets().find((d) => d.id === 'menu');
    const before = engine.baseRows(dataset);
    const after = engine.runWhere(dataset, "status = 'returned'").rows;
    const diff = engine.diffRows(before, after);
    assert.deepEqual(diff.kept, after.map((r) => r.id));
    assert.equal(diff.kept.length + diff.removed.length, before.length);
  });

  test('集計クエリを実行できる', () => {
    const dataset = allDatasets().find((d) => d.id === 'sales');
    const result = engine.runAggregate(dataset, dataset.aggregates[0]);
    assert.equal(result.ok, true);
    assert.ok(result.rows.length > 0);
    assert.ok(result.columns.includes('件数'));
  });

  test('危険な集計式は拒否する', () => {
    const dataset = allDatasets().find((d) => d.id === 'sales');
    assert.throws(
      () => engine.runAggregate(dataset, {
        groupBy: 'category',
        select: [{ expr: 'EVIL(amount)', as: 'x' }],
      }),
      /許可されていない集計式/,
    );
  });

  test('パイプラインを実行して中間段を返す', () => {
    const dataset = allDatasets().find((d) => d.id === 'members');
    const result = engine.runPipeline(dataset, dataset.pipelines[0]);
    assert.equal(result.ok, true);
    assert.ok(result.stages.length > 0);
    assert.ok(result.rows.length > 0);
  });

  test('取得上限を超えたら打ち切る', () => {
    const bigPath = join(dir, 'big.db');
    createDatabase(bigPath);
    const writable = new DatabaseSync(bigPath);
    writable.exec(
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 150)
       INSERT INTO menu (name, price, list_price, status, stock)
       SELECT '追加' || n, 100, 100, 'served', 1 FROM seq`,
    );
    writable.close();

    const bigEngine = openEngine(bigPath);
    try {
      const dataset = allDatasets().find((d) => d.id === 'menu');
      const result = bigEngine.runWhere(dataset, 'price > 0');
      assert.equal(result.truncated, true);
      assert.equal(result.ok, false);
      assert.ok(result.rows.length <= CONFIG.maxRows);
    } finally {
      bigEngine.close();
    }
  });
});
