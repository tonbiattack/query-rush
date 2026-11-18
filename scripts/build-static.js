/**
 * 静的ビルド（Issue #8）。
 *
 * SQLiteによる問題生成・一意性検証をビルド時に実行し、
 * 検証済みの問題を静的JSONへ出力する。これにより GitHub Pages のような
 * 静的ホスティングでもサーバー無しで遊べる。
 *
 * 出力:
 *   dist/index.html
 *   dist/styles.css
 *   dist/app.js
 *   dist/records.js
 *   dist/questions.json   … 検証済みの問題バンク
 *
 * 使い方: npm run build
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import { createDatabase, openEngine } from '../src/engine.js';
import { MODES, MODE_ORDER } from '../src/modes.js';
import { buildQuestionBank } from '../src/questions.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

function main() {
  // 1. 問題を生成して検証する（ビルド時にSQLiteを実行）
  const tempDir = mkdtempSync(join(tmpdir(), 'query-rush-build-'));
  const dbPath = createDatabase(join(tempDir, 'build.db'));
  const engine = openEngine(dbPath);
  const bank = buildQuestionBank(engine);
  engine.close();

  const total = Object.values(bank).reduce((sum, list) => sum + list.length, 0);
  if (total === 0) throw new Error('問題を1問も生成できませんでした');

  // 2. 静的JSONへ書き出す
  //    クライアントが必要とする情報だけに絞る（正解IDは含めるが、
  //    それは4択の判定に必要なため。チート防止はMVPの範囲外）
  const payload = {
    version: 1,
    builtAt: new Date().toISOString(),
    config: {
      timeAttackSeconds: CONFIG.timeAttackSeconds,
      basePoints: CONFIG.basePoints,
      speedBonusMax: CONFIG.speedBonusMax,
      streakStep: CONFIG.streakStep,
      streakBonusMax: CONFIG.streakBonusMax,
      revealSeconds: CONFIG.revealSeconds,
      maxTableRows: CONFIG.maxTableRows,
      choiceCount: CONFIG.choiceCount,
    },
    modes: MODE_ORDER.map((id) => ({
      id,
      name: MODES[id].name,
      short: MODES[id].short,
      description: MODES[id].description,
      questionSeconds: MODES[id].questionSeconds,
      tone: MODES[id].tone,
      questionCount: bank[id].length,
    })),
    questions: Object.fromEntries(
      MODE_ORDER.map((id) => [
        id,
        bank[id].map((question) => ({
          id: question.id,
          datasetId: question.datasetId,
          mode: question.mode,
          category: question.category,
          title: question.title,
          columns: question.columns,
          beforeColumns: question.beforeColumns ?? question.columns,
          before: question.before,
          after: question.after,
          diff: question.diff,
          /** 段の数だけを渡す（段の中身は答えになるので渡さない） */
          stageCount: question.stageCount ?? 0,
          showBefore: question.showBefore ?? true,
          correct: question.correct,
          distractors: question.distractors,
          /** 誤答時に「その選択肢だとどうなったか」を見せるためのデータ（#23） */
          distractorPreviews: question.distractorPreviews ?? {},
          explanation: question.explanation,
        })),
      ]),
    ),
  };

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // 3. 静的ファイルをコピー
  for (const file of ['index.html', 'styles.css', 'app.js', 'records.js', 'engine.js', 'format.js', 'explain.js']) {
    cpSync(join(PUBLIC, file), join(DIST, file));
  }

  writeFileSync(join(DIST, 'questions.json'), JSON.stringify(payload), 'utf8');

  // 4. GitHub Pages 用の .nojekyll（_ で始まるファイルを無視させない）
  writeFileSync(join(DIST, '.nojekyll'), '', 'utf8');

  console.log(`ビルド完了: ${DIST}`);
  console.log(`  問題数: ${total}`);
  for (const id of MODE_ORDER) {
    console.log(`    ${MODES[id].name}: ${bank[id].length}問`);
  }
}

main();
