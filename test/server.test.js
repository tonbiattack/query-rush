import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../src/engine.js';
import { createApp } from '../src/server.js';

test('HTTP APIでゲームを進められ、クロスオリジンは拒否する', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'query-rush-http-'));
  const dbPath = join(dir, 'test.db');
  createDatabase(dbPath);
  const { server, engine } = createApp({ dbPath });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const boot = await (await fetch(`${base}/api/bootstrap`)).json();
    assert.ok(boot.questionCount >= 20);
    assert.equal(boot.state.status, 'idle');
    assert.equal(boot.config.choiceCount, 4);
    assert.equal((await fetch(base)).status, 200);

    const start = await fetch(`${base}/api/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ questionSeconds: 5 }),
    });
    const started = await start.json();
    assert.equal(started.status, 'playing');
    assert.equal(started.choices.length, 4);
    assert.equal(started.questionLimitMs, 5000);

    // 正解を選ぶと得点が入る
    const correctId = started.choices[0].id;
    const answered = await (
      await fetch(`${base}/api/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ choiceId: correctId }),
      })
    ).json();
    assert.equal(answered.phase, 'revealed');
    assert.ok(['correct', 'incorrect'].includes(answered.reveal.outcome));

    const next = await (
      await fetch(`${base}/api/next`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: '{}',
      })
    ).json();
    assert.equal(next.phase, 'answering');

    // クロスオリジンは拒否
    const badOrigin = await fetch(`${base}/api/next`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: '{}',
    });
    assert.equal(badOrigin.status, 403);

    // Content-Type が JSON でない POST は拒否
    const badContentType = await fetch(`${base}/api/answer`, { method: 'POST', body: '{}' });
    assert.equal(badContentType.status, 403);

    // 大きすぎるボディは 413
    const tooLarge = await fetch(`${base}/api/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(5000),
    });
    assert.equal(tooLarge.status, 413);

    // ディレクトリトラバーサルは拒否
    const traversal = await fetch(`${base}/../package.json`);
    assert.notEqual(traversal.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    engine.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
