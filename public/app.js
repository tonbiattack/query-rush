/**
 * QUERY RUSH のクライアント。
 *
 * 状態はサーバーが持つ。ここは「見て選ぶ」テンポだけに集中する。
 * チップを押す → /api/answer → 返ってきたスナップショットで描き直す。
 *
 * タイマーはクライアント側で補間する（毎フレームAPIを叩かない）。
 * 時間切れはサーバーに確定させる。
 */

const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  sessionFill: $('session-fill'),
  sessionText: $('session-text'),
  session: document.querySelector('.session'),
  score: $('score'),
  streak: $('streak'),
  correct: $('correct'),
  beforeBody: $('before-body'),
  afterBody: $('after-body'),
  askText: $('ask-text'),
  potential: $('potential'),
  potentialValue: $('potential-value'),
  choices: $('choices'),
  reveal: $('reveal'),
  revealVerdict: $('reveal-verdict'),
  revealExplanation: $('reveal-explanation'),
  nextBtn: $('next-btn'),
  overlay: $('overlay'),
  overlayCard: $('overlay-card'),
  floaters: $('floaters'),
};

const state = {
  boot: null,
  view: null,
  /** セッション全体の締切（performance.now基準） */
  sessionEndsAt: 0,
  /** 現在の問題の締切（performance.now基準） */
  questionEndsAt: 0,
  raf: 0,
  /** 選択した制限時間（秒） */
  questionSeconds: 5,
  actions: Promise.resolve(),
};

/* ── API ─────────────────────────────────────────── */

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
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
}

function renderTables(view) {
  const question = view.question;
  if (!question) return;

  const removed = new Set(question.diff.removed);
  const kept = new Set(question.diff.kept);

  el.beforeBody.replaceChildren(
    buildTable(question.columns, question.before, (row) =>
      removed.has(row.id) ? 'is-removed' : kept.has(row.id) ? 'is-kept' : '',
    ),
  );
  el.afterBody.replaceChildren(
    buildTable(question.columns, question.after, () => 'is-kept'),
  );
}

function renderChoices(view) {
  const question = view.question;
  if (!question) return;

  const reveal = view.reveal;
  const answered = view.phase === 'revealed';

  // 選択肢の並びは問題ごとに固定。revealed中は同じ並びのまま色を付ける。
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
    label.textContent = choice.label;

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
      下の4択から、その変化を起こした WHERE を選んでください。
      正誤と解説が出ている間はタイマーが止まります。
    </p>
    <ul class="rules">
      <li>問題は常に1問。同時に2問は出ません</li>
      <li>4択の位置は毎回同じ。探す時間はありません</li>
      <li>速く正解するほど点が高い。連続正解でさらに上乗せ</li>
    </ul>
    <p class="overlay-lead" style="margin-bottom:8px">1問の制限時間</p>
    <div class="limit-picker" id="limit-picker"></div>
    <div class="overlay-actions">
      <button type="button" class="btn btn-next" id="start-btn">はじめる</button>
    </div>
  `;

  const picker = card.querySelector('#limit-picker');
  for (const seconds of state.boot.config.questionSecondsOptions) {
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

  card.querySelector('#start-btn').addEventListener('click', startGame);
  return card;
}

function resultCard(view) {
  const card = document.createElement('div');
  const accuracy = view.answered === 0 ? 0 : Math.round((view.correct / view.answered) * 100);
  card.innerHTML = `
    <p class="overlay-eyebrow">TIME UP</p>
    <h1 class="overlay-title">おあいそ。</h1>
    <div class="overlay-score">
      <strong>${view.score.toLocaleString('ja-JP')}</strong>
      <span>点</span>
    </div>
    <dl class="breakdown">
      <div><dt>正解</dt><dd>${view.correct}</dd></div>
      <div><dt>ミス</dt><dd>${view.misses}</dd></div>
      <div><dt>最大ストリーク</dt><dd>${view.maxStreak}</dd></div>
      <div><dt>正答率</dt><dd>${accuracy}%</dd></div>
    </dl>
    <p class="overlay-lead">${verdict(view, accuracy)}</p>
    <div class="overlay-actions">
      <button type="button" class="btn btn-next" id="retry-btn">もう一度</button>
    </div>
  `;
  card.querySelector('#retry-btn').addEventListener('click', startGame);
  return card;
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
  const sessionRemaining = playing
    ? Math.max(0, state.sessionEndsAt - performance.now())
    : view.remainingSessionMs;
  const sessionRatio = Math.max(0, Math.min(1, sessionRemaining / view.sessionMs));

  el.sessionFill.style.width = `${sessionRatio * 100}%`;
  el.sessionText.textContent = (sessionRemaining / 1000).toFixed(1);
  el.session.classList.toggle('is-urgent', sessionRemaining <= 10_000);

  // スコア減衰のライブ表示（いま正解したら何点か）
  if (playing && view.phase === 'answering') {
    const questionRemaining = Math.max(0, state.questionEndsAt - performance.now());
    const ratio = Math.max(0, Math.min(1, questionRemaining / view.questionLimitMs));
    const speed = Math.round(state.boot.config.speedBonusMax * ratio);
    const streakBonus = Math.min(view.streak * state.boot.config.streakStep, state.boot.config.streakBonusMax);
    const total = state.boot.config.basePoints + speed + streakBonus;
    el.potentialValue.textContent = String(total);
    el.potential.classList.toggle('is-low', ratio < 0.34);

    if (questionRemaining <= 0) {
      requestTick();
      return;
    }
  }

  if (playing && sessionRemaining <= 0) {
    requestTick();
    return;
  }

  if (playing) state.raf = requestAnimationFrame(tick);
}

/** 時間切れをサーバーに確定させる（失敗しても再試行する） */
function requestTick() {
  api('/api/tick')
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

/* ── 操作 ────────────────────────────────────────── */

// 連続タップを捨てず、入力された順番でサーバーへ送る。
function enqueueAction(path, body, { start = false } = {}) {
  state.actions = state.actions.then(async () => {
    try {
      const view = await api(path, body);
      render(view);
      if (start || view.status === 'over' || view.phase === 'answering') startTimer(view);
    } catch (error) {
      // 応答だけが失われた場合もあるので、再送せず現在の状態を取得する。
      try {
        const view = await api('/api/state');
        render(view);
        startTimer(view);
      } catch {
        showOverlay(
          Object.assign(document.createElement('p'), {
            textContent: 'サーバーに接続できません。再起動してページを更新してください。',
          }),
        );
      }
      console.error(error);
    }
  });
  return state.actions;
}

function startGame() {
  return enqueueAction('/api/start', { questionSeconds: state.questionSeconds }, { start: true });
}

function submitAnswer(choiceId) {
  if (state.view?.status !== 'playing' || state.view?.phase !== 'answering') return;
  return enqueueAction('/api/answer', { choiceId });
}

function goNext() {
  if (state.view?.status !== 'playing' || state.view?.phase !== 'revealed') return;
  return enqueueAction('/api/next', {});
}

/* ── 起動 ────────────────────────────────────────── */

async function boot() {
  state.boot = await api('/api/bootstrap');
  state.questionSeconds = state.boot.config.defaultQuestionSeconds;

  el.nextBtn.addEventListener('click', goNext);

  // 数字キー1〜4で回答、Enterで次へ
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.target.closest('input, textarea, select')) return;

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
