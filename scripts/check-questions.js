/**
 * 問題データの検証（Issue #2 / #4 の受け入れ条件を機械的に確かめる）。
 *
 *  1. 一意性   … 4択のうち、正解のWHEREでだけ目標の絞り込み後テーブルになる
 *  2. 惜しさ   … 不正解は同じ列・近い演算子・似た列名から選ばれている
 *  3. 行数     … 表示は最大8行に収まる
 *  4. 変化     … 行が実際に減る（絞り込みになっている）
 *  5. コスト   … 100ms / 100行を超えない
 *
 * 使い方: npm run check:questions
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../src/config.js';
import { DATASETS } from '../src/data.js';
import { createDatabase, openEngine, signatureOf } from '../src/engine.js';
import { buildQuestionBank } from '../src/questions.js';

function main() {
  const dir = mkdtempSync(join(tmpdir(), 'query-rush-'));
  const dbPath = join(dir, 'check.db');
  createDatabase(dbPath);
  const engine = openEngine(dbPath);

  let failures = 0;
  let total = 0;

  for (const dataset of DATASETS) {
    const before = engine.baseRows(dataset);
    console.log(`\n=== ${dataset.id} (${dataset.title}) 全${before.length}行 / 候補${dataset.candidates.length} ===`);

    if (before.length > CONFIG.maxTableRows) {
      console.log(`✗ 絞り込み前が${before.length}行で表示上限${CONFIG.maxTableRows}を超えています`);
      failures += 1;
    }

    for (const candidate of dataset.candidates) {
      const result = engine.runWhere(dataset, candidate.sql);
      if (!result.ok) {
        console.log(`✗ ${candidate.id}: 実行できない → ${result.error}`);
        failures += 1;
        continue;
      }
      if (result.overBudget || result.truncated) {
        console.log(`✗ ${candidate.id}: コスト超過`);
        failures += 1;
      }
    }

    const questions = buildQuestionBank(engine).filter((q) => q.datasetId === dataset.id);
    console.log(`  作れる問題: ${questions.length}`);

    for (const question of questions) {
      total += 1;
      const problems = [];
      const signature = signatureOf(question.after, question.columns);

      // 1. 一意性: 4択のうち正解だけが同じ結果になる
      for (const distractor of question.distractors) {
        const other = engine.runWhere(dataset, distractor.sql);
        if (other.ok && signatureOf(other.rows, question.columns) === signature) {
          problems.push(`不正解 ${distractor.id} が正解と同じ結果`);
        }
      }

      // 2. 惜しさ: 不正解が正解と無関係でない
      for (const distractor of question.distractors) {
        const a = question.correct.sql.split(/\s+/)[0];
        const b = distractor.sql.split(/\s+/)[0];
        const related = a === b || a.includes(b) || b.includes(a) ||
          (a === 'price' && b === 'list_price') || (a === 'list_price' && b === 'price') ||
          (a === 'qty' && b === 'total') || (a === 'total' && b === 'qty');
        if (!related) problems.push(`不正解 ${distractor.id} が正解と無関係（${a} と ${b}）`);
      }

      // 3. 行数
      if (question.after.length > CONFIG.maxTableRows) problems.push(`${question.after.length}行で上限超過`);
      if (question.before.length > CONFIG.maxTableRows) problems.push(`絞り込み前が${question.before.length}行で上限超過`);

      // 4. 変化
      if (question.after.length >= question.before.length) problems.push('行が減っていない');

      // 5. 選択肢数
      if (question.distractors.length !== CONFIG.choiceCount - 1) {
        problems.push(`不正解が${question.distractors.length}個`);
      }

      if (problems.length > 0) {
        failures += 1;
        console.log(`  ✗ ${question.id} (${question.correct.label})`);
        for (const problem of problems) console.log(`      ! ${problem}`);
      }
    }
  }

  engine.close();
  rmSync(dir, { recursive: true, force: true });

  console.log(`\n合計 ${total} 問`);
  if (failures > 0) {
    console.error(`${failures} 件が条件を満たしていません`);
    process.exitCode = 1;
  } else {
    console.log('すべての問題が「一意・惜しい不正解・8行以内・行が減る・コスト内」を満たしています');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
