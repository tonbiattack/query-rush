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
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { createDatabase, openEngine } from './engine.js';
import { createGame } from './game.js';
import { DEFAULT_MODE, MODES, isModeId, modeList } from './modes.js';
import { buildQuestionBank } from './questions.js';

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
  const tempDir = dbPath ? null : mkdtempSync(join(tmpdir(), 'query-rush-'));
  if (tempDir) dbPath = createDatabase(join(tempDir, 'game.db'));
  const engine = openEngine(dbPath);
  const bank = buildQuestionBank(engine);

  const totalQuestions = Object.values(bank).reduce((sum, list) => sum + list.length, 0);
  if (totalQuestions === 0) throw new Error('問題を1問も生成できませんでした');

  let game = createGame({ bank: bank[DEFAULT_MODE], mode: DEFAULT_MODE });
  let recentIds = [];

  const routes = {
    'GET /api/bootstrap': () => ({
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
      modes: modeList().map((mode) => ({
        id: mode.id,
        name: mode.name,
        short: mode.short,
        description: mode.description,
        questionSeconds: mode.questionSeconds,
        tone: mode.tone,
        questionCount: bank[mode.id]?.length ?? 0,
      })),
      questionCount: totalQuestions,
      state: game.view(),
    }),
    'POST /api/start': (body) => {
      const modeId = isModeId(body.mode) ? body.mode : DEFAULT_MODE;
      const modeBank = bank[modeId];
      if (!modeBank || modeBank.length === 0) {
        throw new Error(`モード ${modeId} の問題がありません`);
      }
      const seconds = Number(body.questionSeconds);
      const allowed = Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
      game = createGame({
        bank: modeBank,
        mode: modeId,
        questionSeconds: allowed,
        recentIds,
      });
      return game.start();
    },
    'POST /api/answer': (body) => game.answer(String(body.choiceId ?? '')),
    'POST /api/next': () => {
      const view = game.next();
      // セッション終了時に出題済みIDを記録する（#10 次回の偏り防止）
      if (view.status === 'over') recentIds = [];
      return view;
    },
    'POST /api/tick': () => game.tick(),
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
    if (target !== PUBLIC_DIR && !target.startsWith(`${PUBLIC_DIR}${sep}`)) {
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
      if (
        (origin && origin !== `http://${host}`) ||
        !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')
      ) {
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
        const tooLarge = error instanceof Error && error.message === 'request too large';
        res.writeHead(tooLarge ? 413 : 500, { 'content-type': 'application/json; charset=utf-8' });
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
  return { server, engine, game: () => game, bank, modes: MODES };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server } = createApp();
  server.listen(CONFIG.port, '127.0.0.1', () => {
    console.log(`QUERY RUSH: http://127.0.0.1:${CONFIG.port}`);
  });
}
