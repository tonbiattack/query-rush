/**
 * 問題生成（Issue #2 / #4）。
 *
 * 1問 = データセット1つ ＋ 正解のWHERE1つ ＋ 惜しい不正解3つ。
 *
 * 生成条件（docs/SPEC.md「データ設計」）:
 *  - 絞り込み後テーブルは一意に定まる（4択のうち正解のWHEREでだけその結果になる）
 *  - 表示は最大8行
 *  - 不正解は「惜しいもの」（> と >=、等号の向き、似た列名）で、ランダムなダミーは入れない
 *  - 100ms / 100行を超える問題は成立させない
 */
import { CONFIG } from './config.js';
import { DATASETS } from './data.js';
import { signatureOf } from './engine.js';

/** WHERE から列名を取り出す */
function columnOf(where) {
  return String(where).trim().split(/\s+/)[0].toLowerCase();
}

/** WHERE から演算子を取り出す */
function operatorOf(where) {
  return (String(where).match(/IS\s+NOT\s+NULL|IS\s+NULL|>=|<=|!=|<>|=|>|</i) ?? [''])[0].toUpperCase();
}

/**
 * 惜しさスコア。高いほど「正解に近い＝良い不正解」。
 *
 * 同じ列 > 似た列名 > 同じ演算子 > 近い演算子 の順に重い。
 * 列がまったく違う候補は、たとえ演算子が同じでも惜しくない。
 */
function closeness(dataset, correct, candidate) {
  const a = columnOf(correct.sql);
  const b = columnOf(candidate.sql);
  const similar = (dataset.similarColumns ?? []).some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );

  let score = 0;
  if (a === b) score += 1000;
  else if (similar) score += 600;
  else return 0; // 列が無関係な候補は不正解に使わない

  const opA = operatorOf(correct.sql);
  const opB = operatorOf(candidate.sql);
  if (opA === opB) score += 100;
  else if ((opA === '>' && opB === '>=') || (opA === '>=' && opB === '>')) score += 90;
  else if ((opA === '<' && opB === '<=') || (opA === '<=' && opB === '<')) score += 90;
  else if ((opA === '=' && opB === '!=') || (opA === '!=' && opB === '=')) score += 80;
  else if ((opA === '=' && opB === 'IS NULL') || (opA === 'IS NULL' && opB === '=')) score += 70;
  else if ((opA === '=' && opB === 'IS NOT NULL') || (opA === 'IS NOT NULL' && opB === '=')) score += 70;
  else if ((opA === 'IS NULL' && opB === 'IS NOT NULL') || (opA === 'IS NOT NULL' && opB === 'IS NULL')) score += 85;
  else score += 20;

  return score;
}

/**
 * 1つのデータセットから作れる問題をすべて列挙する。
 * 正解候補ごとに、その結果が一意になるものだけを返す。
 */
export function enumerateQuestions(engine, dataset) {
  const columns = dataset.columns;
  const before = engine.baseRows(dataset);

  // 各候補の実行結果を先に求める
  const results = new Map();
  for (const candidate of dataset.candidates) {
    results.set(candidate.id, engine.runWhere(dataset, candidate.sql));
  }

  const questions = [];
  for (const correct of dataset.candidates) {
    const result = results.get(correct.id);
    if (!result.ok) continue;
    // 全行が残る候補は「絞り込み」になっていないので正解にしない
    if (result.rows.length === 0 || result.rows.length >= before.length) continue;
    if (result.rows.length > CONFIG.maxTableRows) continue;

    const signature = signatureOf(result.rows, columns);

    // 同じ結果になる候補が他にあれば、正解が一意でないので問題にしない
    const sameResult = dataset.candidates.filter(
      (candidate) =>
        candidate.id !== correct.id &&
        results.get(candidate.id).ok &&
        signatureOf(results.get(candidate.id).rows, columns) === signature,
    );
    if (sameResult.length > 0) continue;

    // 惜しい不正解を3つ選ぶ。結果が正解と同じものは使えない（一意性が崩れる）
    const distractors = dataset.candidates
      .filter((candidate) => candidate.id !== correct.id)
      .filter((candidate) => {
        const other = results.get(candidate.id);
        if (!other.ok) return false;
        return signatureOf(other.rows, columns) !== signature;
      })
      .map((candidate) => ({ candidate, score: closeness(dataset, correct, candidate) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CONFIG.choiceCount - 1)
      .map((entry) => entry.candidate);

    if (distractors.length < CONFIG.choiceCount - 1) continue;

    questions.push({
      id: `${dataset.id}:${correct.id}`,
      datasetId: dataset.id,
      title: dataset.title,
      columns,
      before,
      after: result.rows,
      diff: engine.diffRows(before, result.rows),
      correct,
      distractors,
      /** 解説の材料。なぜその候補が正解かの1行をここで組み立てる */
      explanation: buildExplanation(correct, result.rows, before),
    });
  }
  return questions;
}

/**
 * 1行解説。学びはここにだけ置く（docs/SPEC.md コアループ3）。
 * 消えた行と残った行の違いを、列名の読み比べではなくデータの見た目で説明する。
 */
function buildExplanation(correct, after, before) {
  const removed = before.length - after.length;
  const column = columnOf(correct.sql);
  const op = operatorOf(correct.sql);
  const value = (String(correct.sql).match(/'([^']*)'/) ?? [])[1];

  if (op === 'IS NULL') return `${column} が空の行だけ残る。NULL は比較で消える点に注意。`;
  if (op === 'IS NOT NULL') return `${column} が入っている行だけ残る。NULL の行はここで落ちる。`;
  if (op === '!=' || op === '<>') {
    return `${column} が ${value ?? 'その値'} 以外の行だけ残る。${removed}行が消えた。`;
  }
  if (op === '>=' || op === '<=') {
    return `${column} が境界を含む（${op}）。境界ちょうどの行が残るかが分かれ目。`;
  }
  if (op === '>' || op === '<') {
    return `${column} が境界を含まない（${op}）。境界ちょうどの行は消える。`;
  }
  return `${column} が ${value ?? 'その値'} の行だけ残る。${removed}行が消えた。`;
}

/** 全データセットから問題を集める */
export function buildQuestionBank(engine) {
  const questions = [];
  for (const dataset of DATASETS) {
    questions.push(...enumerateQuestions(engine, dataset));
  }
  return questions;
}
