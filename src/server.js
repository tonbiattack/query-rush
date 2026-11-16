/**
 * 最小GUIのサーバー。
 *
 * 静的ファイル（public/）と、ゲーム状態を操作するJSON APIを提供する。
 * ゲームの状態はサーバー側に1つだけ持つ（1プレイ完結型なので十分）。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { CHIPS, SHELF_LAYOUT } from './chips.js';
import { createDatabase, openEngine } from './engine.js';
import { createGame } from './game.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createApp({ dbPath } = {}) {
  // プレイデータは固定シード。過去のバージョンのDBを再利用せず、
  // 起動ごとに専用の一時DBを作って読み取り専用で開く。
  const tempDir = dbPath ? null : mkdtempSync(join(tmpdir(), 'query-rush-'));
  if (tempDir) dbPath = createDatabase(join(tempDir, 'game.db'));
  const engine = openEngine(dbPath);
  const game = createGame({ engine });

  const routes = {
    'GET /api/bootstrap': () => ({
      config: {
        sprintSeconds: CONFIG.sprintSeconds,
        queryTimeoutMs: CONFIG.queryTimeoutMs,
        maxRows: CONFIG.maxRows,
        basePoints: CONFIG.basePoints,
        comboStep: CONFIG.comboStep,
        comboMaxMultiplier: CONFIG.comboMaxMultiplier,
        timeBonusPerSecond: CONFIG.timeBonusPerSecond,
        timeBonusWindowSeconds: CONFIG.timeBonusWindowSeconds,
      },
      chips: CHIPS,
      shelf: SHELF_LAYOUT,
      allRows: game.allRows,
      state: game.view(),
    }),
    'POST /api/start': () => game.start(),
    'POST /api/chip': (body) => game.toggleChip(String(body.chipId ?? '')),
    'POST /api/clear': () => game.clearPlacement(),
    'POST /api/serve': () => game.serve(),
    'GET /api/state': () => game.view(),
  };

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) throw new Error('request too large');
      chunks.push(chunk);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return {};
    }
  }

  async function serveStatic(pathname, res) {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = normalize(join(PUBLIC_DIR, relative));
    // ディレクトリトラバーサル防止
    if (target !== PUBLIC_DIR && !target.startsWith(`${PUBLIC_DIR}${process.platform === 'win32' ? '\\' : '/'}`)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      const data = await readFile(target);
      res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const host = req.headers.host ?? '';
    const port = server.address()?.port ?? CONFIG.port;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(host)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${host}`) ||
          !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
        res.writeHead(403).end('forbidden');
        return;
      }
    }
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key];

    if (handler) {
      try {
        const body = req.method === 'POST' ? await readBody(req) : {};
        const payload = handler(body);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
      } catch (error) {
        res.writeHead(error?.message === 'request too large' ? 413 : 500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(url.pathname, res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  if (tempDir) {
    server.once('close', () => {
      engine.close();
      rmSync(tempDir, { recursive: true, force: true });
    });
  }
  return { server, engine, game };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server } = createApp();
  server.listen(CONFIG.port, '127.0.0.1', () => {
    console.log(`QUERY RUSH: http://127.0.0.1:${CONFIG.port}`);
  });
}
