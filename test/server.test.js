import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../src/engine.js';
import { createApp } from '../src/server.js';

test('HTTP API supports a game and rejects cross-origin requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'query-rush-http-'));
  const dbPath = join(dir, 'test.db');
  createDatabase(dbPath);
  const { server, engine } = createApp({ dbPath });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const boot = await (await fetch(`${base}/api/bootstrap`)).json();
    assert.equal(boot.chips.length, 8);
    assert.equal(boot.state.status, 'idle');
    assert.equal((await fetch(base)).status, 200);
    const start = await fetch(`${base}/api/start`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}',
    });
    assert.equal((await start.json()).status, 'playing');
    const badOrigin = await fetch(`${base}/api/clear`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.com' }, body: '{}',
    });
    assert.equal(badOrigin.status, 403);
    const badContentType = await fetch(`${base}/api/serve`, { method: 'POST', body: '{}' });
    assert.equal(badContentType.status, 403);
    const tooLarge = await fetch(`${base}/api/chip`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(5000),
    });
    assert.equal(tooLarge.status, 413);
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.misses, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    engine.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
