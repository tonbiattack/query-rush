/**
 * 問題生成（Issue #2 / #4 / #9 / #13 / #14 / #15 / #16）。
 *
 * 1問 = データセット1つ ＋ 正解の選択肢1つ ＋ 惜しい不正解3つ。
 *
 * 生成条件（docs/SPEC.md「データ設計」）:
 *  - 結果は一意に定まる（4択のうち正解でだけその結果になる）
 *  - 表示は最大8行
 *  - 不正解は「惜しいもの」で、ランダムなダミーは入れない
 *  - 100ms / 100行を超える問題は成立させない
 *
 * モードごとの違いは「何を候補とし、何を結果とするか」だけ。
 * 生成・一意性検証・解説の組み立ては共通。
 */
import { CONFIG } from './config.js';
import { DATASETS, MODE_DATASETS } from './data.js';
import { signatureOf } from './engine.js';
import { MODES } from './modes.js';

/** 式から列名を取り出す */
function columnOf(sql) {
  return String(sql).trim().split(/\s+/)[0].toLowerCase();
}

/** 式から演算子を取り出す */
function operatorOf(sql) {
  return (String(sql).match(/IS\s+NOT\s+NULL|IS\s+NULL|NOT\s+BETWEEN|BETWEEN|NOT\s+IN|IN|NOT\s+LIKE|LIKE|>=|<=|!=|<>|=|>|</i) ?? [''])[0].toUpperCase();
}

/**
 * 惜しさスコア。高いほど「正解に近い＝良い不正解」。
 *
 * 同じ列 > 似た列名 > 同じ関数 > 同じ演算子 > 近い演算子 の順に重い。
 * CASE / COALESCE / NULLIF のような式は、列が違っても
 * 「同じ種類の式」なら惜しい不正解として使える。
 */
function closeness(dataset, correct, candidate) {
  const a = columnOf(correct.sql);
  const b = columnOf(candidate.sql);
  const similar = (dataset.similarColumns ?? []).some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );

  // 式の種類（CASE / COALESCE / NULLIF / EXISTS / 単純比較）
  const kindOf = (sql) => {
    const text = String(sql).toUpperCase();
    if (text.startsWith('CASE')) return 'CASE';
    if (text.startsWith('COALESCE')) return 'COALESCE';
    if (text.startsWith('NULLIF')) return 'NULLIF';
    if (text.includes('EXISTS')) return 'EXISTS';
    return 'COMPARE';
  };
  const kindA = kindOf(correct.sql);
  const kindB = kindOf(candidate.sql);

  let score = 0;
  if (a === b) score += 1000;
  else if (similar) score += 600;
  else if (kindA === kindB && kindA !== 'COMPARE') score += 500; // 同じ種類の式
  else return 0;

  const opA = operatorOf(correct.sql);
  const opB = operatorOf(candidate.sql);
  if (opA === opB) score += 100;
  else if ((opA === '>' && opB === '>=') || (opA === '>=' && opB === '>')) score += 90;
  else if ((opA === '<' && opB === '<=') || (opA === '<=' && opB === '<')) score += 90;
  else if ((opA === '=' && opB === '!=') || (opA === '!=' && opB === '=')) score += 80;
  else if ((opA === '=' && opB === 'IS NULL') || (opA === 'IS NULL' && opB === '=')) score += 70;
  else if ((opA === '=' && opB === 'IS NOT NULL') || (opA === 'IS NOT NULL' && opB === '=')) score += 70;
  else if ((opA === 'IS NULL' && opB === 'IS NOT NULL') || (opA === 'IS NOT NULL' && opB === 'IS NULL')) score += 85;
  else if ((opA === 'IN' && opB === 'NOT IN') || (opA === 'NOT IN' && opB === 'IN')) score += 85;
  else if ((opA === 'BETWEEN' && opB === 'NOT BETWEEN') || (opA === 'NOT BETWEEN' && opB === 'BETWEEN')) score += 85;
  else if ((opA === 'LIKE' && opB === 'NOT LIKE') || (opA === 'NOT LIKE' && opB === 'LIKE')) score += 85;
  else score += 20;

  return score;
}

/**
 * 候補群から、結果が一意になる問題を作る。
 *
 * @param {object} options
 * @param {object} options.dataset
 * @param {string} options.mode
 * @param {Array<{id,label,run:Function}>} options.candidates 実行方法つき候補
 * @param {object[]} options.before 絞り込み前の行
 * @param {string[]} options.columns 表示する列
 * @param {Function} options.explain 解説の組み立て
 */
function buildFromCandidates({ dataset, mode, candidates, before, columns, explain, extra = {} }) {
  // 各候補の実行結果を先に求める
  const results = new Map();
  for (const candidate of candidates) {
    results.set(candidate.id, candidate.run());
  }

  const questions = [];
  for (const correct of candidates) {
    const result = results.get(correct.id);
    if (!result.ok) continue;
    if (result.rows.length === 0) continue;
    if (result.rows.length > CONFIG.maxTableRows) continue;
    // 全行が残る候補は「変化」がないので正解にしない
    if (result.rows.length >= before.length) continue;

    const signature = signatureOf(result.rows, columns);

    // 同じ結果になる候補が他にあれば、正解が一意でないので問題にしない
    const sameResult = candidates.filter(
      (candidate) =>
        candidate.id !== correct.id &&
        results.get(candidate.id).ok &&
        signatureOf(results.get(candidate.id).rows, columns) === signature,
    );
    if (sameResult.length > 0) continue;

    // 惜しい不正解を3つ選ぶ
    const distractors = candidates
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
      mode,
      category: MODES[mode]?.short ?? mode,
      title: dataset.title,
      columns,
      before,
      after: result.rows,
      diff: { kept: result.rows.map((r) => r.id), removed: before.filter((r) => !result.rows.some((a) => a.id === r.id)).map((r) => r.id) },
      correct: { id: correct.id, label: correct.label },
      distractors: distractors.map((d) => ({ id: d.id, label: d.label })),
      explanation: explain(correct, result.rows, before),
      ...extra,
    });
  }
  return questions;
}

/* ── Filter / Advanced（WHERE で行が絞られる） ─────────── */

export function enumerateFilterQuestions(engine, dataset, mode = 'filter') {
  const before = engine.baseRows(dataset);
  const columns = dataset.columns;
  const candidates = dataset.candidates.map((candidate) => ({
    ...candidate,
    run: () => engine.runWhere(dataset, candidate.sql),
  }));

  return buildFromCandidates({
    dataset,
    mode,
    candidates,
    before,
    columns,
    explain: (correct, after, rows) => buildFilterExplanation(correct, after, rows),
  });
}

function buildFilterExplanation(correct, after, before) {
  const removed = before.length - after.length;
  const column = columnOf(correct.sql);
  const op = operatorOf(correct.sql);
  const value = (String(correct.sql).match(/'([^']*)'/) ?? [])[1];

  if (op === 'IS NULL') return `${column} が空の行だけ残る。NULL は比較で消える点に注意。`;
  if (op === 'IS NOT NULL') return `${column} が入っている行だけ残る。NULL の行はここで落ちる。`;
  if (op === 'NOT IN') return `${column} がその集合に入らない行だけ残る。NULL は IN でも NOT IN でも落ちる。`;
  if (op === 'IN') return `${column} がその集合に入る行だけ残る。${removed}行が消えた。`;
  if (op === 'NOT BETWEEN') return `${column} が範囲の外の行だけ残る。境界は含まれない。`;
  if (op === 'BETWEEN') return `${column} が範囲内（両端を含む）の行だけ残る。`;
  if (op === 'NOT LIKE') return `${column} がパターンに一致しない行だけ残る。`;
  if (op === 'LIKE') return `${column} がパターンに一致する行だけ残る。`;
  if (op === '!=' || op === '<>') return `${column} が ${value ?? 'その値'} 以外の行だけ残る。${removed}行が消えた。`;
  if (op === '>=' || op === '<=') return `${column} が境界を含む（${op}）。境界ちょうどの行が残るかが分かれ目。`;
  if (op === '>' || op === '<') return `${column} が境界を含まない（${op}）。境界ちょうどの行は消える。`;
  return `${column} が ${value ?? 'その値'} の行だけ残る。${removed}行が消えた。`;
}

/* ── Logic（式の評価結果で行が決まる） ───────────────── */

export function enumerateLogicQuestions(engine, dataset) {
  const before = engine.baseRows(dataset);
  const columns = dataset.columns;
  const candidates = dataset.candidates.map((candidate) => ({
    ...candidate,
    run: () => engine.runWhere(dataset, candidate.sql),
  }));

  return buildFromCandidates({
    dataset,
    mode: 'logic',
    candidates,
    before,
    columns,
    explain: (correct, after, rows) => buildLogicExplanation(correct, after, rows),
  });
}

function buildLogicExplanation(correct, after, before) {
  const sql = String(correct.sql);
  const removed = before.length - after.length;

  if (/CASE/i.test(sql)) {
    if (/IS\s+NULL/i.test(sql) && !/ELSE/i.test(sql)) {
      return 'ELSE の無い CASE は、どの WHEN も成立しないと NULL になる。NULL は比較で消える。';
    }
    if ((sql.match(/WHEN/gi) ?? []).length > 1) {
      return 'CASE は上から順に評価し、最初に成立した WHEN で確定する。後の WHEN は見ない。';
    }
    return `CASE の分岐で振り分けた結果、${removed}行が条件から外れた。`;
  }
  if (/COALESCE/i.test(sql)) {
    return 'COALESCE は最初の非NULLを返す。NULL の行がここで補われる。';
  }
  if (/NULLIF/i.test(sql)) {
    return 'NULLIF(a, b) は a = b のとき NULL を返す。等しい行だけが NULL 扱いになる。';
  }
  if (/EXISTS/i.test(sql)) {
    return 'EXISTS は副問い合わせに行があれば真。行そのものではなく存在だけを見る。';
  }
  return `式の評価結果で${removed}行が外れた。`;
}

/* ── Aggregate（GROUP BY / HAVING） ──────────────────── */

export function enumerateAggregateQuestions(engine, dataset) {
  const before = engine.baseRows(dataset);
  const columns = ['group', '件数', '合計'];

  // 集計結果は「グループごとの行」なので、比較対象は集計後のテーブル
  const candidates = (dataset.aggregates ?? []).map((aggregate) => ({
    id: aggregate.id,
    label: aggregate.label,
    run: () => engine.runAggregate(dataset, aggregate),
  }));

  const questions = [];
  const results = new Map();
  for (const candidate of candidates) {
    results.set(candidate.id, candidate.run());
  }

  for (const correct of candidates) {
    const result = results.get(correct.id);
    if (!result.ok) continue;
    if (result.rows.length === 0 || result.rows.length > CONFIG.maxTableRows) continue;

    const resultColumns = result.columns;
    const signature = signatureOf(result.rows, resultColumns);

    const sameResult = candidates.filter(
      (candidate) =>
        candidate.id !== correct.id &&
        results.get(candidate.id).ok &&
        signatureOf(results.get(candidate.id).rows, resultColumns) === signature,
    );
    if (sameResult.length > 0) continue;

    const distractors = candidates
      .filter((candidate) => candidate.id !== correct.id)
      .filter((candidate) => {
        const other = results.get(candidate.id);
        if (!other.ok) return false;
        return signatureOf(other.rows, resultColumns) !== signature;
      })
      .slice(0, CONFIG.choiceCount - 1);

    if (distractors.length < CONFIG.choiceCount - 1) continue;

    questions.push({
      id: `${dataset.id}:${correct.id}`,
      datasetId: dataset.id,
      mode: 'aggregate',
      category: MODES.aggregate.short,
      title: dataset.title,
      columns: resultColumns,
      /** 集計前は元の行の列で描く */
      beforeColumns: dataset.columns,
      before,
      after: result.rows,
      diff: { kept: [], removed: [] },
      correct: { id: correct.id, label: correct.label },
      distractors: distractors.map((d) => ({ id: d.id, label: d.label })),
      explanation: buildAggregateExplanation(correct, result.rows),
      /** 集計モードは「前のテーブル」ではなく「元の行」を見せる */
      showBefore: true,
    });
  }
  return questions;
}

function buildAggregateExplanation(correct, rows) {
  const label = correct.label;
  if (/HAVING/i.test(label)) {
    return 'HAVING は集計した後に絞る。WHERE と違い、グループごとの結果に対して効く。';
  }
  if (/COUNT\(amount\)/i.test(label)) {
    return 'COUNT(列) は NULL を数えない。COUNT(*) との差がそのまま NULL の数になる。';
  }
  if (/AVG/i.test(label)) return 'AVG は NULL を無視して平均する。件数が減る点に注意。';
  return `${rows.length}グループに畳まれた。GROUP BY は同じ値の行を1行にまとめる。`;
}

/* ── Pipeline（CTE / JOIN） ──────────────────────────── */

export function enumeratePipelineQuestions(engine, dataset) {
  const before = engine.baseRows(dataset);
  const columns = dataset.columns;

  const candidates = (dataset.pipelines ?? []).map((pipeline) => ({
    id: pipeline.id,
    label: pipeline.label,
    run: () => engine.runPipeline(dataset, pipeline),
  }));

  const questions = [];
  const results = new Map();
  for (const candidate of candidates) {
    results.set(candidate.id, candidate.run());
  }

  for (const correct of candidates) {
    const result = results.get(correct.id);
    if (!result.ok) continue;
    if (result.rows.length === 0 || result.rows.length > CONFIG.maxTableRows) continue;
    if (result.rows.length >= before.length) continue;

    // 最終段で行が変わらないなら「パイプライン」になっていないので問題にしない。
    // （中間結果と最終結果が同じだと、段を追う意味がなくなる）
    const lastStage = result.stages[result.stages.length - 1];
    if (lastStage && signatureOf(lastStage.rows, columns) === signatureOf(result.rows, columns)) {
      continue;
    }

    const signature = signatureOf(result.rows, columns);

    const sameResult = candidates.filter(
      (candidate) =>
        candidate.id !== correct.id &&
        results.get(candidate.id).ok &&
        signatureOf(results.get(candidate.id).rows, columns) === signature,
    );
    if (sameResult.length > 0) continue;

    const distractors = candidates
      .filter((candidate) => candidate.id !== correct.id)
      .filter((candidate) => {
        const other = results.get(candidate.id);
        if (!other.ok) return false;
        return signatureOf(other.rows, columns) !== signature;
      })
      .slice(0, CONFIG.choiceCount - 1);

    if (distractors.length < CONFIG.choiceCount - 1) continue;

    questions.push({
      id: `${dataset.id}:${correct.id}`,
      datasetId: dataset.id,
      mode: 'pipeline',
      category: MODES.pipeline.short,
      title: dataset.title,
      columns,
      before,
      after: result.rows,
      diff: { kept: result.rows.map((r) => r.id), removed: before.filter((r) => !result.rows.some((a) => a.id === r.id)).map((r) => r.id) },
      correct: { id: correct.id, label: correct.label },
      distractors: distractors.map((d) => ({ id: d.id, label: d.label })),
      explanation: buildPipelineExplanation(correct, result),
      /**
       * 段の「数」だけを渡す。段ごとの条件や行は渡さない。
       * 中間結果を見せると、それがそのまま答えになるため。
       */
      stageCount: result.stages.length + (result.stages.length > 0 ? 1 : 0),
    });
  }
  return questions;
}

function buildPipelineExplanation(correct, result) {
  const stageCount = result.stages?.length ?? 0;
  if (stageCount > 1) {
    return `CTE は上から順に評価される。${stageCount}段を経て最後の条件まで残った行だけが結果になる。`;
  }
  return 'CTE の中間結果に対して、外側の WHERE がさらに効く。内側で消えた行は戻らない。';
}
/* ── 問題バンクの構築 ────────────────────────────────── */

/** 1モードぶんの問題を作る */
export function buildModeBank(engine, mode) {
  if (mode === 'filter') {
    return DATASETS.flatMap((dataset) => enumerateFilterQuestions(engine, dataset, 'filter'));
  }
  if (mode === 'advanced') {
    return MODE_DATASETS.filter((d) => d.mode === 'advanced').flatMap((dataset) =>
      enumerateFilterQuestions(engine, dataset, 'advanced'),
    );
  }
  if (mode === 'logic') {
    return MODE_DATASETS.filter((d) => d.mode === 'logic').flatMap((dataset) =>
      enumerateLogicQuestions(engine, dataset),
    );
  }
  if (mode === 'aggregate') {
    return MODE_DATASETS.filter((d) => d.mode === 'aggregate').flatMap((dataset) =>
      enumerateAggregateQuestions(engine, dataset),
    );
  }
  if (mode === 'pipeline') {
    return MODE_DATASETS.filter((d) => d.mode === 'pipeline').flatMap((dataset) =>
      enumeratePipelineQuestions(engine, dataset),
    );
  }
  if (mode === 'master') {
    return ['filter', 'advanced', 'logic', 'aggregate', 'pipeline'].flatMap((id) =>
      buildModeBank(engine, id),
    );
  }
  throw new Error(`不明なモードです: ${mode}`);
}

/** 全モードの問題バンク */
export function buildQuestionBank(engine) {
  const bank = {};
  for (const mode of Object.keys(MODES)) {
    bank[mode] = buildModeBank(engine, mode);
  }
  return bank;
}
