/**
 * QUERY RUSH のクライアント。
 *
 * 2つの動作モードを持つ:
 *  - サーバーモード: /api/* と通信する（ローカル起動時）
 *  - スタティックモード: questions.json を読み、ブラウザ内で完結する（GitHub Pages）
 *
 * どちらでもUIとテンポは同じ。タイマーはクライアント側で補間し、
 * 正誤表示中は止める（#7）。
 */

import { bestFor, clearRecords, recordResult } from './records.js';
import { createGame } from './engine.js';
import { formatChoiceLabel } from './format.js';

const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  modeBadge: $('mode-badge'),
  sessionFill: $('session-fill'),
  sessionText: $('session-text'),
  session: document.querySelector('.session'),
  score: $('score'),
  streak: $('streak'),
  correct: $('correct'),
  tables: $('tables'),
  panelBefore: $('panel-before'),
  beforeTitle: $('before-title'),
  beforeBody: $('before-body'),
  arrow: $('arrow'),
  afterTitle: $('after-title'),
  afterBody: $('after-body'),
  askText: $('ask-text'),
  potential: $('potential'),
  potentialValue: $('potential-value'),
  choices: $('choices'),
  reveal: $('reveal'),
  revealVerdict: $('reveal-verdict'),
  revealExplanation: $('reveal-explanation'),
  revealDetail: $('reveal-detail'),
  revealDetailSummary: $('reveal-detail-summary'),
  revealDetailBody: $('reveal-detail-body'),
  nextBtn: $('next-btn'),
  overlay: $('overlay'),
  overlayCard: $('overlay-card'),
  floaters: $('floaters'),
};

const state = {
  boot: null,
  view: null,
  sessionEndsAt: 0,
  questionEndsAt: 0,
  raf: 0,
  mode: 'filter',
  questionSeconds: 5,
  actions: Promise.resolve(),
  recorded: false,
  /** スタティックモードのゲーム実体（サーバーモードでは null） */
  localGame: null,
  /** サーバーが使えるか */
  serverMode: false,
};

/* ── バックエンド抽象 ─────────────────────────────── */

/** サーバーが使えるか試す */
async function detectServer() {
  try {
    const res = await fetch('./api/bootstrap', { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.modes ? data : null;
  } catch {
    return null;
  }
}

/** スタティックJSONを読む */
async function loadStatic() {
  const res = await fetch('./questions.json');
  if (!res.ok) throw new Error('questions.json を読み込めません');
  return res.json();
}

/** サーバーAPIを叩く */
async function api(path, body) {
  const res = await fetch(`./api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

/* ── 操作（サーバー／スタティック共通の入口） ───────── */

function startGame() {
  state.recorded = false;
  return enqueue(async () => {
    if (state.serverMode) {
      return api('/start', { mode: state.mode, questionSeconds: state.questionSeconds });
    }
    const bank = state.boot.questions[state.mode];
    state.localGame = createGame({
      bank,
      mode: state.mode,
      questionSeconds: state.questionSeconds,
      config: state.boot.config,
    });
    return state.localGame.start();
  }, { start: true });
}

function submitAnswer(choiceId) {
  if (state.view?.status !== 'playing' || state.view?.phase !== 'answering') return;
  return enqueue(async () => {
    if (state.serverMode) return api('/answer', { choiceId });
    return state.localGame.answer(choiceId);
  });
}

function goNext() {
  if (state.view?.status !== 'playing' || state.view?.phase !== 'revealed') return;
  return enqueue(async () => {
    if (state.serverMode) return api('/next', {});
    return state.localGame.next();
  });
}

/** 時間切れの確定 */
function requestTick() {
  const run = async () => {
    if (state.serverMode) return api('/tick');
    return state.localGame.tick();
  };
  run()
    .then((next) => {
      render(next);
      if (next.status === 'playing') {
        state.sessionEndsAt = performance.now() + next.remainingSessionMs;
        state.questionEndsAt = performance.now() + next.remainingQuestionMs;
        setTimeout(tick, 60);
      } else {
        startTimer(next);
      }
    })
    .catch(() => setTimeout(tick, 800));
}

/** 連続操作を順番に処理する */
function enqueue(task, { start = false } = {}) {
  state.actions = state.actions.then(async () => {
    try {
      const view = await task();
      render(view);
      if (start || view.status === 'over' || view.phase === 'answering') startTimer(view);
    } catch (error) {
      console.error(error);
      // サーバーモードで応答が失われた場合は状態を取り直す
      if (state.serverMode) {
        try {
          const view = await api('/state');
          render(view);
          startTimer(view);
        } catch {
          showOverlay(
            Object.assign(document.createElement('p'), {
              textContent: 'サーバーに接続できません。再読み込みしてください。',
            }),
          );
        }
      }
    }
  });
  return state.actions;
}

/* ── 描画 ────────────────────────────────────────── */

function render(view) {
  const previous = state.view;
  state.view = view;

  renderHud(view);
  renderTables(view);
  renderChoices(view);
  renderReveal(view);
  renderOverlay(view);
  renderEvents(view, previous);
}

function renderHud(view) {
  el.score.textContent = String(view.score);
  el.streak.textContent = String(view.streak);
  el.correct.textContent = String(view.correct);
  const mode = state.boot.modes.find((m) => m.id === view.mode);
  el.modeBadge.textContent = mode?.short ?? view.mode;
  el.modeBadge.dataset.tone = mode?.tone ?? 'wasabi';
}

function renderTables(view) {
  const question = view.question;
  if (!question) return;

  const removed = new Set(question.diff.removed);
  const kept = new Set(question.diff.kept);

  const isAggregate = question.mode === 'aggregate';
  const showBefore = question.showBefore !== false;
  el.panelBefore.hidden = !showBefore;
  el.arrow.hidden = !showBefore;
  el.tables.classList.toggle('is-single', !showBefore);

  el.beforeTitle.textContent = isAggregate ? '元の行' : '絞り込み前';
  el.afterTitle.textContent = isAggregate ? '集計後' : '絞り込み後';

  if (showBefore) {
    const beforeColumns = question.beforeColumns ?? question.columns;
    el.beforeBody.replaceChildren(
      buildTable(beforeColumns, question.before, (row) =>
        isAggregate ? '' : removed.has(row.id) ? 'is-removed' : kept.has(row.id) ? 'is-kept' : '',
      ),
    );
  }

  // パイプラインは「何段あるか」だけを示す（段の中身は答えになるので出さない）
  if (question.stageCount > 0) {
    el.afterBody.replaceChildren(
      buildStageNote(question.stageCount),
      buildTable(question.columns, question.after, () => 'is-kept'),
    );
  } else {
    el.afterBody.replaceChildren(buildTable(question.columns, question.after, () => 'is-kept'));
  }
}

/**
 * パイプラインの段数だけを示す。
 *
 * 段ごとの条件や中間結果を出すと、それがそのまま答えになる。
 * 「何段の処理を通ったか」だけを手がかりに、最終結果から逆算させる。
 */
function buildStageNote(stageCount) {
  const note = document.createElement('p');
  note.className = 'stage-note';
  note.textContent = `CTE ${stageCount - 1}段 → 最終結果`;
  return note;
}

function renderChoices(view) {
  const question = view.question;
  if (!question) return;

  const reveal = view.reveal;
  const answered = view.phase === 'revealed';

  const fragment = document.createDocumentFragment();
  view.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.choiceId = choice.id;
    button.disabled = answered;

    const key = document.createElement('span');
    key.className = 'choice-key';
    key.textContent = String(index + 1);

    const label = document.createElement('span');
    label.className = 'choice-label';
    // 長いSQLは句の区切りで改行する（Issue #18）。判定は choice.id で行う
    label.textContent = formatChoiceLabel(choice.label);

    button.append(key, label);

    if (answered) {
      if (choice.id === reveal.correctId) button.classList.add('is-correct');
      else if (choice.id === reveal.selectedId) button.classList.add('is-wrong');
      else button.classList.add('is-dimmed');
    }

    button.addEventListener('click', () => submitAnswer(choice.id));
    fragment.append(button);
  });
  el.choices.replaceChildren(fragment);
}

function renderReveal(view) {
  const reveal = view.reveal;
  if (view.phase !== 'revealed' || !reveal) {
    el.reveal.hidden = true;
    return;
  }

  el.reveal.hidden = false;
  el.reveal.classList.toggle('is-correct', reveal.outcome === 'correct');
  el.reveal.classList.toggle('is-wrong', reveal.outcome !== 'correct');

  if (reveal.outcome === 'correct') {
    el.revealVerdict.textContent = `正解 +${reveal.gained.total}`;
  } else if (reveal.outcome === 'timeout') {
    el.revealVerdict.textContent = '時間切れ';
  } else {
    el.revealVerdict.textContent = '不正解';
  }
  el.revealExplanation.textContent = reveal.explanation;

  renderWrongDetail(view, reveal);
}

/**
 * 誤答時に「選んだ条件だとどうなったか」を展開式で見せる（#23）。
 *
 * 既定は閉じたまま。開いたときだけ、その選択肢の結果と正解との差分を出す。
 * タイマーは止まっているので、読みたい人だけ読める。
 */
function renderWrongDetail(view, reveal) {
  const detail = el.revealDetail;
  const wrong = reveal.wrongDetail;

  if (!wrong || !wrong.rows) {
    detail.hidden = true;
    detail.open = false;
    return;
  }

  detail.hidden = false;
  detail.open = false;

  // 要約に理由を1行だけ出す（開かなくても原因が分かる）
  el.revealDetailSummary.textContent = wrong.reason ?? '選んだ条件だとどうなったか';

  const body = el.revealDetailBody;
  body.replaceChildren();

  const extra = new Set(wrong.extra ?? []);
  const missing = new Set(wrong.missing ?? []);
  const question = view.question;

  // その選択肢を選んだ場合の結果テーブル
  const caption = document.createElement('p');
  caption.className = 'reveal-detail-caption';
  caption.textContent = '選んだ条件での結果';
  body.append(caption);

  // 集計モードは選択肢ごとに列が違うので、その結果自身の列で描く
  const previewColumns = wrong.columns ?? question.columns;
  body.append(
    buildTable(previewColumns, wrong.rows, (row) => {
      const key = row.id ?? row[previewColumns[0]];
      if (extra.has(key)) return 'is-extra';
      if (missing.has(key)) return 'is-missing';
      return 'is-kept';
    }),
  );

  // 差分の要約
  const summary = document.createElement('p');
  summary.className = 'reveal-detail-diff';
  const parts = [];
  if (extra.size > 0) parts.push(`正解にない行が ${extra.size} 行`);
  if (missing.size > 0) parts.push(`正解にある行が ${missing.size} 行足りない`);
  summary.textContent = parts.length > 0 ? parts.join(' / ') : '行は同じだが中身が違う';
  body.append(summary);
}

function renderOverlay(view) {
  if (view.status === 'idle') {
    showOverlay(startCard());
    return;
  }
  if (view.status === 'over') {
    showOverlay(resultCard(view));
    return;
  }
  hideOverlay();
}

function renderEvents(view, previous) {
  if (!previous || !view.lastEvent) return;
  const event = view.lastEvent;
  if (event === previous.lastEvent) return;

  if (event.type === 'answer' && event.outcome === 'correct') {
    floatText(`+${event.gained.total}`, 'good');
    shake();
  } else if (event.type === 'answer' || event.type === 'timeout') {
    floatText(event.type === 'timeout' ? '時間切れ' : 'ミス', 'bad');
  }
}

/* ── 部品 ────────────────────────────────────────── */

function buildTable(columns, rows, classOf) {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.textContent = column;
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const extra = classOf(row);
    if (extra) tr.className = extra;
    for (const column of columns) {
      const td = document.createElement('td');
      const value = row[column];
      td.textContent = formatCell(value);
      if (typeof value === 'number') td.className = 'num';
      if (value === null) td.classList.add('is-null');
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

/**
 * パイプラインの中間段を「段 → 段 → 最終」で見せる。
 *
 * 段のラベルに条件（`team = 'a'` など）を出してはいけない。
 * それがそのまま答えになるため、段の名前だけを示す。
 */
function formatCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toLocaleString('ja-JP');
  return String(value);
}

function floatText(text, kind) {
  const node = document.createElement('div');
  node.className = `floater is-${kind}`;
  node.textContent = text;
  node.style.left = '50%';
  node.style.top = '42%';
  el.floaters.append(node);
  setTimeout(() => node.remove(), 950);
}

function shake() {
  el.app.classList.remove('is-shake');
  void el.app.offsetWidth;
  el.app.classList.add('is-shake');
}

/* ── オーバーレイ ────────────────────────────────── */

function showOverlay(content) {
  el.overlayCard.replaceChildren(content);
  el.overlay.hidden = false;
}

function hideOverlay() {
  el.overlay.hidden = true;
}

function startCard() {
  const card = document.createElement('div');
  card.innerHTML = `
    <p class="overlay-eyebrow">60 SECOND TIME ATTACK</p>
    <h1 class="overlay-title">どの WHERE で、<br />こうなった？</h1>
    <p class="overlay-lead">
      上に「絞り込み前」と「絞り込み後」のテーブルが出ます。
      下の4択から、その変化を起こした条件を選んでください。
      正誤と解説が出ている間はタイマーが止まります。
    </p>
    <p class="overlay-lead overlay-label">モード</p>
    <div class="mode-picker" id="mode-picker"></div>
    <p class="overlay-lead overlay-label">1問の制限時間</p>
    <div class="limit-picker" id="limit-picker"></div>
    <div class="overlay-actions">
      <button type="button" class="btn btn-next" id="start-btn">はじめる</button>
      <button type="button" class="btn btn-ghost" id="clear-records-btn">記録を消す</button>
    </div>
  `;

  const modePicker = card.querySelector('#mode-picker');
  for (const mode of state.boot.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-option';
    button.dataset.mode = mode.id;
    button.dataset.tone = mode.tone;
    button.setAttribute('aria-pressed', String(mode.id === state.mode));
    button.innerHTML = `
      <span class="mode-option-name"></span>
      <span class="mode-option-desc"></span>
      <span class="mode-option-meta"></span>
    `;
    button.querySelector('.mode-option-name').textContent = mode.name;
    button.querySelector('.mode-option-desc').textContent = mode.description;
    const best = bestFor(mode.id, mode.questionSeconds);
    button.querySelector('.mode-option-meta').textContent =
      `${mode.questionCount}問` + (best !== null ? ` · 自己ベスト ${best}` : '');
    button.addEventListener('click', () => {
      state.mode = mode.id;
      state.questionSeconds = mode.questionSeconds;
      for (const other of modePicker.children) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      renderLimitPicker(card);
    });
    modePicker.append(button);
  }

  card.querySelector('#start-btn').addEventListener('click', startGame);
  card.querySelector('#clear-records-btn').addEventListener('click', () => {
    clearRecords();
    showOverlay(startCard());
  });

  const selected = state.boot.modes.find((m) => m.id === state.mode);
  state.questionSeconds = selected?.questionSeconds ?? 5;
  renderLimitPicker(card);

  return card;
}

function renderLimitPicker(card) {
  const picker = card.querySelector('#limit-picker');
  if (!picker) return;
  picker.replaceChildren();

  const mode = state.boot.modes.find((m) => m.id === state.mode);
  const base = mode?.questionSeconds ?? 5;
  const options = [...new Set([base, 3, 5, 8, 15])].sort((a, b) => a - b);

  for (const seconds of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'limit-option';
    button.textContent = `${seconds}秒`;
    button.setAttribute('aria-pressed', String(seconds === state.questionSeconds));
    button.addEventListener('click', () => {
      state.questionSeconds = seconds;
      for (const other of picker.children) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
    picker.append(button);
  }
}

function resultCard(view) {
  const card = document.createElement('div');
  const accuracy = view.answered === 0 ? 0 : Math.round((view.correct / view.answered) * 100);

  let record = null;
  if (!state.recorded) {
    state.recorded = true;
    record = recordResult({
      mode: view.mode,
      questionSeconds: state.questionSeconds,
      score: view.score,
      correct: view.correct,
      misses: view.misses,
      maxStreak: view.maxStreak,
      answered: view.answered,
    });
  }

  const bestLine = record
    ? record.isBest
      ? record.previousBest === null
        ? '<p class="record-line is-best">はじめての記録です</p>'
        : `<p class="record-line is-best">自己ベスト更新（前回 ${record.previousBest}）</p>`
      : record.average !== null
        ? `<p class="record-line">平均 ${record.average} との差 ${view.score - record.average >= 0 ? '+' : ''}${view.score - record.average}</p>`
        : ''
    : '';

  const categories = Object.entries(view.byCategory ?? {});
  const categoryRows = categories.length > 1
    ? `<dl class="breakdown breakdown-category">${categories
        .map(
          ([name, stat]) =>
            `<div><dt>${escapeHtml(name)}</dt><dd>${stat.correct}/${stat.total}</dd></div>`,
        )
        .join('')}</dl>`
    : '';

  card.innerHTML = `
    <p class="overlay-eyebrow">TIME UP</p>
    <h1 class="overlay-title">おあいそ。</h1>
    <div class="overlay-score">
      <strong>${view.score.toLocaleString('ja-JP')}</strong>
      <span>点</span>
    </div>
    ${bestLine}
    <dl class="breakdown">
      <div><dt>正解</dt><dd>${view.correct}</dd></div>
      <div><dt>ミス</dt><dd>${view.misses}</dd></div>
      <div><dt>最大ストリーク</dt><dd>${view.maxStreak}</dd></div>
      <div><dt>正答率</dt><dd>${accuracy}%</dd></div>
    </dl>
    ${categoryRows}
    <p class="overlay-lead">${verdict(view, accuracy)}</p>
    <div class="overlay-actions">
      <button type="button" class="btn btn-next" id="retry-btn">もう一度</button>
      <button type="button" class="btn btn-ghost" id="back-btn">モード選択</button>
    </div>
  `;
  card.querySelector('#retry-btn').addEventListener('click', startGame);
  card.querySelector('#back-btn').addEventListener('click', () => {
    state.recorded = false;
    showOverlay(startCard());
  });
  return card;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function verdict(view, accuracy) {
  if (view.answered === 0) return 'まずは1問。見て選ぶだけなので、迷ったら押してみてください。';
  if (accuracy >= 90 && view.maxStreak >= 8) return '見る速さがそのまま点になっています。この調子。';
  if (accuracy >= 90) return '正確です。次はもっと速く。';
  if (view.maxStreak >= 5) return '連続で取れています。ミスを減らせば、まだ上があります。';
  if (accuracy >= 60) return '半分は取れています。境界（> と >=）と NULL の行に注目してみてください。';
  return 'まずは正解を増やすこと。速さは後からついてきます。';
}

/* ── タイマー ────────────────────────────────────── */

function startTimer(view) {
  state.sessionEndsAt = performance.now() + view.remainingSessionMs;
  state.questionEndsAt = performance.now() + view.remainingQuestionMs;
  cancelAnimationFrame(state.raf);
  tick();
}

function tick() {
  const view = state.view;
  if (!view) return;

  const playing = view.status === 'playing';
  const paused = view.phase === 'revealed';

  const sessionRemaining = playing && !paused
    ? Math.max(0, state.sessionEndsAt - performance.now())
    : view.remainingSessionMs;
  const sessionRatio = Math.max(0, Math.min(1, sessionRemaining / view.sessionMs));

  el.sessionFill.style.width = `${sessionRatio * 100}%`;
  el.sessionText.textContent = (sessionRemaining / 1000).toFixed(1);
  el.session.classList.toggle('is-urgent', sessionRemaining <= 10_000);
  el.session.classList.toggle('is-paused', paused);

  if (playing && view.phase === 'answering') {
    const questionRemaining = Math.max(0, state.questionEndsAt - performance.now());
    const ratio = Math.max(0, Math.min(1, questionRemaining / view.questionLimitMs));
    const speed = Math.round(state.boot.config.speedBonusMax * ratio);
    const streakBonus = Math.min(view.streak * state.boot.config.streakStep, state.boot.config.streakBonusMax);
    el.potentialValue.textContent = String(state.boot.config.basePoints + speed + streakBonus);
    el.potential.classList.toggle('is-low', ratio < 0.34);

    if (questionRemaining <= 0) {
      requestTick();
      return;
    }
  }

  if (playing && !paused && sessionRemaining <= 0) {
    requestTick();
    return;
  }

  if (playing) state.raf = requestAnimationFrame(tick);
}

/* ── 起動 ────────────────────────────────────────── */

async function boot() {
  // サーバーがあればサーバーモード、無ければスタティックモード
  const serverBoot = await detectServer();
  if (serverBoot) {
    state.serverMode = true;
    state.boot = serverBoot;
  } else {
    state.serverMode = false;
    const data = await loadStatic();
    state.boot = {
      config: data.config,
      modes: data.modes,
      questions: data.questions,
      state: { status: 'idle', mode: 'filter', phase: 'answering', score: 0, correct: 0, misses: 0, streak: 0, maxStreak: 0, answered: 0, remainingSessionMs: data.config.timeAttackSeconds * 1000, sessionMs: data.config.timeAttackSeconds * 1000, questionLimitMs: 5000, remainingQuestionMs: 5000, question: null, choices: [], reveal: null, byCategory: {}, lastEvent: null },
    };
  }

  state.mode = state.boot.modes[0]?.id ?? 'filter';
  state.questionSeconds = state.boot.modes[0]?.questionSeconds ?? 5;

  el.nextBtn.addEventListener('click', goNext);

  window.addEventListener('keydown', (event) => {
    // window に直接 dispatch されたイベントは target が Element でないことがある
    const target = event.target;
    const isFormField =
      target instanceof Element && target.closest('input, textarea, select');
    if (event.repeat || isFormField) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      if (state.view?.status === 'playing' && state.view?.phase === 'revealed') goNext();
      else if (state.view?.status !== 'playing') startGame();
      return;
    }

    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < state.boot.config.choiceCount) {
      const choice = state.view?.choices?.[index];
      if (choice) {
        event.preventDefault();
        submitAnswer(choice.id);
      }
    }
  });

  render(state.boot.state);
  startTimer(state.boot.state);
}

boot().catch((error) => {
  console.error(error);
  showOverlay(
    Object.assign(document.createElement('p'), {
      textContent: `起動に失敗しました: ${error.message}`,
    }),
  );
});
