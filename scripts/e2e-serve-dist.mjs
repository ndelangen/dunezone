/*
 * Static server for the e2e suite: serves the production client build (dist/client) with the same
 * SPA semantics as the Cloudflare Worker release assembly: any path that is not a file on disk
 * falls back to the prerendered _shell.html. Replaces `vite dev` in scripts/e2e-local.sh
 * phase_serve so e2e tests exercise built, bundled code instead of on-demand dev transforms
 * (which dominated slow-spec wall clock; see prototype/e2e-coverage-build-serve).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)), 'dist', 'client');
const SHELL = join(ROOT, '_shell.html');
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

if (!existsSync(SHELL)) {
  console.error(`[e2e-serve-dist] ${ROOT}/_shell.html missing; run vite build first`);
  process.exit(1);
}

const server = createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    /* Malformed percent-encoding such as /%E0 would otherwise throw and kill the server. */
    res.writeHead(400);
    res.end();
    return;
  }
  /*
   * resolve() collapses any ../ (including percent-encoded ones, since the pathname is decoded
   * above) and the ROOT + sep prefix check rejects what remains, including sibling-directory
   * escapes like /%2e%2e%2fclient-server/ which a bare ROOT prefix would let through. Only a path
   * that passed the check is read; everything else gets the shell.
   */
  const candidate = resolve(ROOT, `.${urlPath}`);
  let file = SHELL;
  if (candidate.startsWith(ROOT + sep) && existsSync(candidate) && !statSync(candidate).isDirectory()) {
    file = candidate;
  }
  try {
    /* Sonar suppression: file is the shell or a path that passed the ROOT + sep check above. */
    const body = readFileSync(file); /* NOSONAR */
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
