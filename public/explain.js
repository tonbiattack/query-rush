/**
 * 誤答の理由づけ（Issue #23）。
 *
 * 選んだ誤答が「なぜ違うか」を1〜2行で説明する。
 * サーバー（src/questions.js）とブラウザ（public/engine.js）の両方から使うため、
 * 依存を持たない純粋関数として独立させている。
 */

/**
 * 選んだ誤答が「なぜ違うか」を1〜2行で説明する。
 *
 * 正解との差分（増えた行・減った行）を数で示し、その原因を
 * 演算子・NULL・優先順位の観点で短く添える。詳細は画面側で展開する。
 */
export function explainWrongChoice(question, choiceId) {
  const preview = question.distractorPreviews?.[choiceId];
  if (!preview) return null;

  const distractor = question.distractors.find((d) => d.id === choiceId);
  if (!distractor) return null;

  const extra = preview.extra?.length ?? 0;
  const missing = preview.missing?.length ?? 0;
  const parts = [];

  if (extra > 0 && missing > 0) {
    parts.push(`正解より${extra}行多く、${missing}行足りない`);
  } else if (extra > 0) {
    parts.push(`正解より${extra}行多い`);
  } else if (missing > 0) {
    parts.push(`正解より${missing}行足りない`);
  } else {
    parts.push('行数は同じだが中身が違う');
  }

  const reason = reasonOf(question.correct.label, distractor.label);
  if (reason) parts.push(reason);

  return parts.join('。') + '。';
}

/** 2つの式の違いから、ありがちな間違いの原因を推定する */
export function reasonOf(correctLabel, wrongLabel) {
  const correct = String(correctLabel);
  const wrong = String(wrongLabel);

  // 境界（> と >=）。`>=` は `>` を含むので、先に「>= かどうか」で分ける
  const hasGe = (text) => text.includes('>=');
  const hasGt = (text) => /(?:^|[^=<>])>(?!=)/.test(text);
  const hasLe = (text) => text.includes('<=');
  const hasLt = (text) => /(?:^|[^=<>])<(?!=)/.test(text);
  const boundaryDiff =
    (hasGe(correct) && hasGt(wrong) && !hasGe(wrong)) ||
    (hasGt(correct) && hasGe(wrong) && !hasGt(wrong)) ||
    (hasLe(correct) && hasLt(wrong) && !hasLe(wrong)) ||
    (hasLt(correct) && hasLe(wrong) && !hasLt(wrong));
  if (boundaryDiff) return '境界を含むかどうか（>= と >）の違い';

  // NULL
  if (/IS\s+NOT\s+NULL/i.test(correct) && /IS\s+NULL/i.test(wrong)) {
    return 'NULL を残すか除くかの違い';
  }
  if (/IS\s+NULL/i.test(correct) && /IS\s+NOT\s+NULL/i.test(wrong)) {
    return 'NULL を残すか除くかの違い';
  }

  // 否定
  if (/!=|<>/.test(correct) !== /!=|<>/.test(wrong)) return '条件を反転させている';

  // グループ化の違い（集計モードはこれが主な違いなので先に見る）
  const hasGroupBy = (text) => /GROUP\s+BY/i.test(text);
  const groupOf = (text) => (text.match(/GROUP\s+BY\s+([A-Za-z_][A-Za-z0-9_]*)/i) ?? [])[1];
  if (hasGroupBy(correct) && hasGroupBy(wrong)) {
    const gCorrect = groupOf(correct);
    const gWrong = groupOf(wrong);
    if (gCorrect && gWrong && gCorrect !== gWrong) {
      return `グループ化する列（${gCorrect} と ${gWrong}）の違い`;
    }
    // グループ列が同じなら、集計の取り方の違いを見る（下の集計関数判定へ）
  } else if (hasGroupBy(correct) !== hasGroupBy(wrong)) {
    return 'グループ化するかどうかの違い';
  }

  // 集計関数
  const aggOf = (text) => (text.match(/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i) ?? [])[1]?.toUpperCase();
  const aggCorrect = aggOf(correct);
  const aggWrong = aggOf(wrong);
  if (aggCorrect && aggWrong && aggCorrect !== aggWrong) {
    return `${aggCorrect} と ${aggWrong} の取り違え`;
  }
  // 片方だけ集計関数を持つ（GROUP BY だけ vs 集計付き）場合
  if (aggCorrect !== aggWrong && (aggCorrect || aggWrong)) {
    const only = aggCorrect ?? aggWrong;
    return `${only} で数えるかどうかの違い`;
  }
  if (aggCorrect && /COUNT\(\s*\*\s*\)/i.test(correct) && /COUNT\(\s*[A-Za-z_]/i.test(wrong)) {
    return 'COUNT(*) と COUNT(列) の違い（NULL を数えるか）';
  }

  // 列の取り違え
  const columnOfLabel = (text) => (text.match(/^[A-Za-z_][A-Za-z0-9_]*/) ?? [])[0];
  const colCorrect = columnOfLabel(correct);
  const colWrong = columnOfLabel(wrong);
  if (colCorrect && colWrong && colCorrect !== colWrong) {
    return `${colCorrect} と ${colWrong} の列の取り違え`;
  }

  return null;
}
