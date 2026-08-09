import { readFileSync, existsSync, statSync } from 'node:fs';
// Static server for the e2e suite: serves the production client build
// (dist/client) with the same SPA semantics as the Cloudflare Worker release
// assembly — any path that is not a file on disk falls back to the prerendered
// _shell.html. Replaces `vite dev` in scripts/e2e-local.sh phase_serve so e2e
// tests exercise built, bundled code instead of on-demand dev transforms
// (which dominated slow-spec wall clock; see prototype/e2e-coverage-build-serve).
import { createServer } from 'node:http';
import { join, extname, normalize } from 'node:path';

const ROOT = join(new URL('..', import.meta.url).pathname, 'dist', 'client');
const PORT = Number(process.env.E2E_APP_PORT ?? process.argv[2] ?? 6001);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.map': 'application/json',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(ROOT, '_shell.html'))) {
  console.error(`[e2e-serve-dist] ${ROOT}/_shell.html missing — run vite build first`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  // normalize() collapses any ../ so requests cannot escape dist/client.
  let file = normalize(join(ROOT, urlPath));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(ROOT, '_shell.html');
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[e2e-serve-dist] serving dist/client on http://localhost:${PORT}`);
});
