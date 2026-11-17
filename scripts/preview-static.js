/**
 * 静的ビルドのプレビュー用サーバー（開発用）。
 *
 * dist/ をそのまま配信する。GitHub Pages と同じ「サーバーAPIなし」の
 * 状態で動作確認するために使う。
 *
 * 使い方: npm run build && npm run preview
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 4174);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const target = normalize(join(DIST, relative));

  if (target !== DIST && !target.startsWith(`${DIST}${sep}`)) {
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
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`静的プレビュー: http://127.0.0.1:${PORT}`);
});
