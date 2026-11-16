/**
 * QUERY RUSH のクライアント。
 *
 * 状態はサーバーが持つ。ここは「押したら即座に反映する」ことだけに集中する。
 * チップを押す → /api/chip → 返ってきたスナップショットで描き直す。
 */

const $ = (id) => document.getElementById(id);

const el = {
  timerFill: $('timer-fill'),
  timerText: $('timer-text'),
  timer: document.querySelector('.timer'),
  score: $('score'),
  combo: $('combo'),
  misses: $('misses'),
  ticketNo: $('ticket-no'),
  ticketTrap: $('ticket-trap'),
  ticketText: $('ticket-text'),
  ticketHint: $('ticket-hint'),
  ticketTrapNote: $('ticket-trap-note'),
  targetBody: $('target-body'),
  sql: $('sql'),
  sqlMeta: $('sql-meta'),
  dataHead: $('data-head'),
  dataBody: $('data-body'),
  dataTable: $('data-table'),
  aggregateNote: $('agg-note'),
  shelf: $('shelf'),
  clear: $('clear'),
  serve: $('serve'),
  overlay: $('overlay'),
  overlayCard: $('overlay-card'),
  floaters: $('floaters'),
  app: document.querySelector('.app'),
};

const state = {
  boot: null,
  view: null,
  /** タイマーはクライアント側で補間する（毎フレームAPIを叩かない） */
  endsAt: 0,
  raf: 0,
  actions: Promise.resolve(),
};

const TRAP_LABEL = { 1: '罠なし', 2: '似た列名', 3: 'NULL・重複' };

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
  renderTicket(view);
  renderTarget(view);
  renderSql(view);
  renderTable(view);
  renderShelf(view);
  renderOverlay(view);
  renderEvents(view, previous);
}

function renderHud(view) {
  el.score.textContent = String(view.score);
  el.combo.textContent = `×${view.comboMultiplier.toFixed(2)}`;
  el.misses.textContent = String(view.misses);
}

function renderTicket(view) {
  const order = view.order;
  el.ticketNo.textContent = `注文 #${view.served + 1}`;
  el.ticketTrap.textContent = TRAP_LABEL[order.difficulty] ?? '罠なし';
  el.ticketTrap.dataset.level = String(order.difficulty);
  el.ticketText.textContent = order.ticket;
  el.ticketHint.textContent = order.hint ?? '';
  el.ticketHint.hidden = !order.hint;
  el.ticketTrapNote.textContent = order.trap ?? '';
  el.ticketTrapNote.hidden = !order.trap;
}

function renderTarget(view) {
  const { columns, rows } = view.order.target;
  el.targetBody.replaceChildren(buildTable(columns, rows, null, { compact: true }));
}

function renderSql(view) {
  el.sql.innerHTML = highlightSql(view.sql || 'SELECT * FROM items');
  const meta = view.result;
  if (!meta) {
    el.sqlMeta.textContent = '';
    return;
  }
  const parts = [`結果 ${meta.rows.length}行`, `${meta.durationMs.toFixed(1)}ms`];
  if (meta.error) parts.push(meta.error);
  if (meta.truncated) parts.push('上限で打ち切り');
  if (meta.overBudget) parts.push('コスト超過');
  el.sqlMeta.textContent = parts.join(' · ');
  el.sqlMeta.classList.toggle('is-over', Boolean(meta.error || meta.overBudget || meta.truncated));
}

function renderTable(view) {
  const result = view.result;
  if (!result) return;

  const aggregate = result.key === 'category';
  el.dataTable.classList.toggle('is-aggregate', aggregate);

  const hasChips = view.placement.where.length > 0 || view.placement.orderBy || view.placement.limit;
  const hitKeys = hasChips ? new Set(result.highlight) : new Set();
  const added = new Set(result.diff?.added ?? []);
  const moved = new Set(result.diff?.moved ?? []);
  const allRows = state.boot.allRows;

  if (aggregate) {
    el.dataHead.replaceChildren(buildHead(result.columns));
    el.dataBody.replaceChildren(
      ...result.rows.map((row) => {
        const tr = document.createElement('tr');
        tr.className = 'is-hit';
        for (const column of result.columns) {
          const td = document.createElement('td');
          const value = row[column];
          td.textContent = formatCell(value);
          if (typeof value === 'number') td.className = 'num';
          tr.append(td);
        }
        return tr;
      }),
    );
    renderAggregateNote(result);
    return;
  }

  el.aggregateNote.hidden = true;

  el.dataHead.replaceChildren(buildHead(state.boot.columns));
  const fragment = document.createDocumentFragment();

  // 結果の並び順を先に表示し、除外された行はその後ろに薄く残す。
  const resultIds = new Set(result.rows.map((row) => row.id));
  const visibleRows = [...result.rows, ...allRows.filter((row) => !resultIds.has(row.id))];
  for (const row of visibleRows) {
    const tr = document.createElement('tr');
    const key = row.id;
    if (hitKeys.has(key)) tr.classList.add('is-hit');
    if (added.has(key)) tr.classList.add('is-added');
    if (moved.has(key)) tr.classList.add('is-moved');

    for (const column of state.boot.columns) {
      const td = document.createElement('td');
      const value = row[column];
      td.textContent = formatCell(value);
      if (typeof value === 'number') td.className = 'num';
      if (value === null) td.classList.add('is-null');
      tr.append(td);
    }
    fragment.append(tr);
  }

  el.dataBody.replaceChildren(fragment);
}

/**
 * 集計モードのとき、下に「集計前の行がどう畳まれたか」を出す。
 * 空いた領域を埋めるだけでなく、GROUP BY が何をしたのかを見せる。
 */
function renderAggregateNote(result) {
  const note = el.aggregateNote;
  note.hidden = false;

  const groups = result.rows.length;
  const sumCount = result.rows.reduce((acc, row) => acc + (row['件数'] ?? 0), 0);
  const sumSales = result.rows.reduce((acc, row) => acc + (row['売上'] ?? 0), 0);

  note.innerHTML = `
    <p class="agg-lead">
      表示中の <strong>${groups}</strong> グループでは、件数の合計は
      <strong>${sumCount.toLocaleString('ja-JP')}</strong>、
      売上の合計は <strong>${sumSales.toLocaleString('ja-JP')}</strong>。
    </p>
    <p class="agg-hint">GROUP BY を外すと、この畳み込みが解けて元の行に戻ります。</p>
  `;
}

function renderShelf(view) {
  const placement = view.placement;
  const active = new Set([
    ...placement.where,
    placement.groupBy,
    placement.orderBy,
    placement.limit,
  ].filter(Boolean));

  for (const button of el.shelf.children) {
    const id = button.dataset.chipId;
    button.setAttribute('aria-pressed', active.has(id) ? 'true' : 'false');
    const chip = state.boot.chips.find((entry) => entry.id === id);
    // 集計中の並び替えは売上合計／カテゴリの行数に対応する。
    const label = placement.groupBy && id === 'o_sales' ? 'SUM(sales) DESC'
      : placement.groupBy && id === 'o_count' ? 'COUNT(*) DESC' : chip.label;
    button.querySelector('.chip-label').textContent = label;
  }

  const playing = view.status === 'playing';
  el.serve.disabled = !playing;
  el.clear.disabled = !playing;
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

  if (event.type === 'served') {
    floatText(`+${event.gained.total}`, 'good');
    if (event.gained.multiplier > 1) {
      floatText(`×${event.gained.multiplier.toFixed(2)}`, 'good', 34);
    }
    shake();
  } else if (event.type === 'miss') {
    floatText(event.reason === 'invalid' ? '不正なクエリ' : '不一致', 'bad');
  }
}

/* ── 部品 ────────────────────────────────────────── */

function buildHead(columns) {
  const tr = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.textContent = column;
    tr.append(th);
  }
  return tr;
}

function buildTable(columns, rows, hitKeys, { compact = false } = {}) {
  const table = document.createElement('table');
  table.append(buildHead(columns));
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (hitKeys?.has(row.id)) tr.classList.add('is-hit');
    for (const column of columns) {
      const td = document.createElement('td');
      const value = row[column];
      td.textContent = formatCell(value);
      if (typeof value === 'number') td.className = 'num';
      if (value === null) tr.classList.add('is-null');
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  if (compact) table.dataset.compact = 'true';
  return table;
}

function formatCell(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toLocaleString('ja-JP');
  return String(value);
}

/** SQLのキーワードと文字列だけ色を付ける（HTMLは必ずエスケープする） */
function highlightSql(sql) {
  const escaped = sql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/('[^']*')/g, '<span class="str">$1</span>')
    .replace(/\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|AND|AS|COUNT|SUM|DESC)\b/g, '<span class="kw">$1</span>');
}

function floatText(text, kind, offset = 0) {
  const node = document.createElement('div');
  node.className = `floater is-${kind}`;
  node.textContent = text;
  node.style.left = '50%';
  node.style.top = `${38 + offset}%`;
  el.floaters.append(node);
  setTimeout(() => node.remove(), 950);
}

function shake() {
  el.app.classList.remove('is-shake');
  // リフローを挟んでアニメーションをやり直す
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
    <p class="overlay-eyebrow">60 SECOND SPRINT</p>
    <h1 class="overlay-title">注文を、SQLで。<br />60秒で何皿捌けるか。</h1>
    <p class="overlay-lead">
      下段のチップを押すとクエリが組み上がり、中段のテーブルがその場で絞り込まれます。
      上段の完成形と一致したら「提供する」。ミスするとコンボが切れます。
    </p>
    <ul class="rules">
      <li>注文は常に1件。同時に2件は出ません</li>
      <li>チップの並びは毎回同じ。探す時間はありません</li>
      <li>ノーミスで繋ぐほどコンボ倍率が伸びます</li>
    </ul>
    <div class="overlay-actions">
      <button type="button" class="btn btn-serve" id="start-btn">はじめる</button>
    </div>
  `;
  card.querySelector('#start-btn').addEventListener('click', startGame);
  return card;
}

function resultCard(view) {
  const card = document.createElement('div');
  card.innerHTML = `
    <p class="overlay-eyebrow">TIME UP</p>
    <h1 class="overlay-title">おあいそ。</h1>
    <div class="overlay-score">
      <strong>${view.score.toLocaleString('ja-JP')}</strong>
      <span>点</span>
    </div>
    <dl class="breakdown">
      <div><dt>捌いた注文</dt><dd>${view.served}</dd></div>
      <div><dt>最大コンボ</dt><dd>${view.maxCombo}</dd></div>
      <div><dt>ミス</dt><dd>${view.misses}</dd></div>
    </dl>
    <p class="overlay-lead">${verdict(view)}</p>
    <div class="overlay-actions">
      <button type="button" class="btn btn-serve" id="retry-btn">もう一度</button>
    </div>
  `;
  card.querySelector('#retry-btn').addEventListener('click', startGame);
  return card;
}

function verdict(view) {
  if (view.misses === 0 && view.served >= 8) return 'ノーミスで駆け抜けました。読み切る速さがそのまま点になっています。';
  if (view.misses === 0) return 'ノーミス。次はもっと速く、もっと多く。';
  if (view.maxCombo >= 4) return 'コンボは伸びました。ミスを減らせば、まだ上があります。';
  return 'まずはミスを減らすこと。速さは後からついてきます。';
}

/* ── タイマー ────────────────────────────────────── */

function startTimer(view) {
  state.endsAt = performance.now() + view.remainingMs;
  cancelAnimationFrame(state.raf);
  tick();
}

function tick() {
  const view = state.view;
  if (!view) return;

  const remaining = view.status === 'playing' ? Math.max(0, state.endsAt - performance.now()) : view.remainingMs;
  const ratio = Math.max(0, Math.min(1, remaining / view.sprintMs));

  el.timerFill.style.width = `${ratio * 100}%`;
  el.timerText.textContent = (remaining / 1000).toFixed(1);
  el.timer.classList.toggle('is-urgent', remaining <= 10_000);

  if (view.status === 'playing' && remaining <= 0) {
    // 到着時の遅延や一時的な通信失敗でも、結果が確定するまで確認する。
    api('/api/state').then((next) => {
      render(next);
      if (next.status === 'playing') {
        state.endsAt = performance.now() + next.remainingMs;
        setTimeout(tick, 250);
      } else {
        startTimer(next);
      }
    }).catch(() => setTimeout(tick, 1000));
    return;
  }

  if (view.status === 'playing') state.raf = requestAnimationFrame(tick);
}

/* ── 操作 ────────────────────────────────────────── */

// 連続タップを捨てず、入力された順番でサーバーへ送る。
function enqueueAction(path, body, { start = false } = {}) {
  state.actions = state.actions.then(async () => {
    if (!start && state.view?.status !== 'playing') return;
    try {
      const view = await api(path, body);
      render(view);
      if (start || view.status === 'over') startTimer(view);
    } catch (error) {
      // 応答だけが失われた場合もあるので、再送せず現在の状態を取得する。
      try {
        const view = await api('/api/state');
        render(view);
        startTimer(view);
        floatText('通信を再接続しました', 'bad');
      } catch {
        showOverlay(Object.assign(document.createElement('p'), {
          textContent: 'サーバーに接続できません。再起動してページを更新してください。',
        }));
      }
      console.error(error);
    }
  });
  return state.actions;
}

function startGame() {
  return enqueueAction('/api/start', {}, { start: true });
}

function pressChip(chipId) {
  if (state.view?.status !== 'playing') return;
  return enqueueAction('/api/chip', { chipId });
}

function clearPlacement() {
  if (state.view?.status !== 'playing') return;
  return enqueueAction('/api/clear', {});
}

function serve() {
  if (state.view?.status !== 'playing') return;
  return enqueueAction('/api/serve', {});
}

/* ── 起動 ────────────────────────────────────────── */

function buildShelf() {
  const fragment = document.createDocumentFragment();
  for (const id of state.boot.shelf) {
    const chip = state.boot.chips.find((c) => c.id === id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.chipId = chip.id;
    button.dataset.tone = chip.tone;
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="chip-slot">${slotLabel(chip.slot)}</span><span class="chip-label"></span>`;
    button.querySelector('.chip-label').textContent = chip.label;
    button.addEventListener('click', () => pressChip(chip.id));
    fragment.append(button);
  }
  el.shelf.replaceChildren(fragment);
}

function slotLabel(slot) {
  return { where: 'WHERE', groupBy: 'GROUP BY', orderBy: 'ORDER BY', limit: 'LIMIT' }[slot] ?? slot;
}

async function boot() {
  state.boot = await api('/api/bootstrap');
  state.boot.columns = state.boot.allRows.length > 0 ? Object.keys(state.boot.allRows[0]) : [];
  buildShelf();

  el.clear.addEventListener('click', clearPlacement);
  el.serve.addEventListener('click', serve);

  // キーボードでも遊べるようにする（1〜8でチップ、Enterで提供、Escでクリア）
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.target.closest('button, input, textarea, select, a')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (state.view?.status === 'playing') serve();
      else startGame();
      return;
    }
    if (event.key === 'Escape') {
      clearPlacement();
      return;
    }
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < state.boot.shelf.length) {
      pressChip(state.boot.shelf[index]);
    }
  });

  render(state.boot.state);
  startTimer(state.boot.state);
}

boot().catch((error) => {
  console.error(error);
  showOverlay(
    Object.assign(document.createElement('div'), {
      textContent: `起動に失敗しました: ${error.message}`,
    }),
  );
});
