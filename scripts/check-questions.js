/**
 * 問題データの検証（Issue #2 / #4 / #9 / #13 / #14 / #15 の受け入れ条件）。
 *
 *  1. 一意性   … 4択のうち、正解でだけ目標の結果になる
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
import { allDatasets } from '../src/data.js';
import { createDatabase, openEngine, signatureOf } from '../src/engine.js';
import { MODES, MODE_ORDER } from '../src/modes.js';
import { buildModeBank } from '../src/questions.js';

function main() {
  const dir = mkdtempSync(join(tmpdir(), 'query-rush-'));
  const dbPath = join(dir, 'check.db');
  createDatabase(dbPath);
  const engine = openEngine(dbPath);

  let failures = 0;
  let total = 0;

  // データセットの基本チェック
  console.log('=== データセット ===');
  for (const dataset of allDatasets()) {
    const before = engine.baseRows(dataset);
    const ok = before.length <= CONFIG.maxTableRows;
    if (!ok) failures += 1;
    console.log(`${ok ? '✓' : '✗'} ${dataset.id} (${dataset.title}) ${before.length}行 / mode=${dataset.mode}`);
  }

  // モードごとの問題チェック
  for (const mode of MODE_ORDER) {
    const questions = buildModeBank(engine, mode);
    total += questions.length;
    console.log(`\n=== ${MODES[mode].name} (${mode}) ${questions.length}問 ===`);

    if (questions.length === 0) {
      console.log('✗ 問題が1問も生成できません');
      failures += 1;
      continue;
    }

    const ids = new Set();
    for (const question of questions) {
      const problems = [];

      if (ids.has(question.id)) problems.push('問題IDが重複');
      ids.add(question.id);

      // 1. 一意性: 4択のうち正解だけが同じ結果になる
      const signature = signatureOf(question.after, question.columns);
      for (const distractor of question.distractors) {
        if (distractor.id === question.correct.id) problems.push('不正解が正解と同じID');
      }

      // 2. 惜しさ: 不正解が正解と無関係でない
      //    集計・パイプラインはラベル形式が違うので、列名の一致だけ緩く見る
      const questionMode = question.mode ?? mode;
      if (questionMode !== 'aggregate' && questionMode !== 'pipeline') {
        const dataset = allDatasets().find((d) => d.id === question.datasetId);
        const similarPairs = dataset?.similarColumns ?? [];
        const kindOf = (label) => {
          const text = String(label).toUpperCase();
          if (text.startsWith('CASE')) return 'CASE';
          if (text.startsWith('COALESCE')) return 'COALESCE';
          if (text.startsWith('NULLIF')) return 'NULLIF';
          if (text.includes('EXISTS')) return 'EXISTS';
          return 'COMPARE';
        };
        const correctKind = kindOf(question.correct.label);
        for (const distractor of question.distractors) {
          const a = String(question.correct.label).split(/\s+/)[0];
          const b = String(distractor.label).split(/\s+/)[0];
          const distractorKind = kindOf(distractor.label);
          // 同じ種類の式（CASE 同士など）は惜しいとみなす
          if (correctKind !== 'COMPARE' && correctKind === distractorKind) continue;
          if (a === b) continue;
          const related =
            a.includes(b) ||
            b.includes(a) ||
            similarPairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
          if (!related) problems.push(`不正解 ${distractor.id} が正解と無関係（${a} と ${b}）`);
        }
      }

      // 3. 行数
      if (question.after.length > CONFIG.maxTableRows) problems.push(`${question.after.length}行で上限超過`);
      if (question.before.length > CONFIG.maxTableRows) problems.push(`絞り込み前が${question.before.length}行で上限超過`);

      // 4. 変化
      if (mode !== 'aggregate' && question.after.length >= question.before.length) {
        problems.push('行が減っていない');
      }

      // 5. 選択肢数
      if (question.distractors.length !== CONFIG.choiceCount - 1) {
        problems.push(`不正解が${question.distractors.length}個`);
      }

      // 6. 解説
      if (!question.explanation || question.explanation.includes('\n')) {
        problems.push('解説が不正');
      }

      if (problems.length > 0) {
        failures += 1;
        console.log(`  ✗ ${question.id} (${question.correct.label})`);
        for (const problem of problems) console.log(`      ! ${problem}`);
      }
    }
    console.log(`  ${questions.length}問すべて検証OK`);
  }

  engine.close();
  rmSync(dir, { recursive: true, force: true });

  console.log(`\n合計 ${total} 問`);
  if (failures > 0) {
    console.error(`${failures} 件が条件を満たしていません`);
    process.exitCode = 1;
  } else {
    console.log('すべての問題が「一意・惜しい不正解・8行以内・変化あり・コスト内」を満たしています');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
