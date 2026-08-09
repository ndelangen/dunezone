// PROTOTYPE — THROWAWAY. Answers one question and then dies:
//   Can the e2e coverage pipeline (Playwright V8 coverage -> monocart -> lcov)
//   produce equivalent output when the app is served as a production build
//   (vite build, sourcemaps on, served from dist/client) instead of vite dev?
//
// Run: node scripts/prototype-coverage-build.mjs [dev|build|build-nomin ...]
// (no args = all three modes). Outputs land in coverage/PROTOTYPE-build-vs-dev/
// and a file-set + line-count diff prints at the end. Requires no Convex
// backend: pages render their unauthenticated/loading shells, which is enough
// to compare module -> source path resolution across serve modes.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import { chromium } from 'playwright';
import MCR from 'monocart-coverage-reports';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_ROOT = join(ROOT, 'coverage', 'PROTOTYPE-build-vs-dev');
const ROUTES = ['/', '/auth/login', '/factions'];
const PORT = 6101;

const MODES = process.argv.slice(2).length ? process.argv.slice(2) : ['dev', 'build', 'build-nomin'];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serveDistClient(port) {
  const root = join(ROOT, 'dist', 'client');
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(root, urlPath);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, '_shell.html'); // SPA fallback (TanStack Start prerendered shell)
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server never came up at ${url}`);
}

// Same shape as e2e/coverage.ts mcrOptions; entryFilter widened so it also
// accepts built chunks (served under /public/, vite build.assetsDir).
function mcrOptions(mode) {
  return {
    name: `prototype ${mode}`,
    outputDir: join(OUT_ROOT, mode),
    reports: [['lcovonly'], ['console-summary']],
    entryFilter: (entry) => entry.url.includes('/src/') || (entry.url.includes('/public/') && entry.url.split('?')[0].endsWith('.js')),
    // Mode-agnostic: dev passes bare filenames with the served path in
    // distFile; build passes sourcemap-resolved src/ paths with the chunk in
    // distFile. Whichever candidate contains src/ wins.
    sourcePath: (filePath, info) => {
      for (const candidate of [filePath, info?.distFile]) {
        const i = candidate?.indexOf('src/') ?? -1;
        if (i >= 0) return candidate.slice(i);
      }
      return filePath;
    },
    sourceFilter: (sourcePath) => sourcePath.startsWith('src/'),
  };
}

async function collect(mode, baseUrl) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  for (const route of ROUTES) {
    await page.goto(baseUrl + route, { waitUntil: 'load' });
    await page.waitForTimeout(2000); // let lazy chunks land
  }
  const entries = await page.coverage.stopJSCoverage();
  await browser.close();
  console.log(`[${mode}] ${entries.length} V8 entries`);
  const mcr = MCR(mcrOptions(mode));
  await mcr.add(entries);
  await mcr.generate();
}

function parseLcov(mode) {
  const file = join(OUT_ROOT, mode, 'lcov.info');
  const out = new Map();
  let sf = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) sf = line.slice(3).trim();
    else if (line.startsWith('LF:')) out.set(sf, { lf: Number(line.slice(3)), lh: out.get(sf)?.lh ?? 0 });
    else if (line.startsWith('LH:')) out.set(sf, { lf: out.get(sf)?.lf ?? 0, lh: Number(line.slice(3)) });
  }
  return out;
}

for (const mode of MODES) {
  if (mode === 'dev') {
    const proc = spawn('npx', ['vite', 'dev', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_E2E_LOCAL_AUTH: 'true' } });
    await waitForHttp(`http://localhost:${PORT}/`);
    await collect(mode, `http://localhost:${PORT}`);
    proc.kill('SIGTERM');
  } else {
    const minify = mode === 'build-nomin' ? ' --minify false' : '';
    console.log(`[${mode}] vite build --sourcemap${minify} ...`);
    execSync(`npx vite build --sourcemap${minify}`, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_E2E_LOCAL_AUTH: 'true' } });
    const server = await serveDistClient(PORT);
    await collect(mode, `http://localhost:${PORT}`);
    server.close();
  }
}

// ---- verdict: file-set + line-count diff across whatever modes ran ----
const parsed = new Map(MODES.filter((m) => existsSync(join(OUT_ROOT, m, 'lcov.info'))).map((m) => [m, parseLcov(m)]));
const [baseMode, ...others] = [...parsed.keys()];
console.log(`\n=== ${baseMode}: ${parsed.get(baseMode).size} src/ files in lcov ===`);
for (const other of others) {
  const a = parsed.get(baseMode);
  const b = parsed.get(other);
  const onlyA = [...a.keys()].filter((f) => !b.has(f));
  const onlyB = [...b.keys()].filter((f) => !a.has(f));
  console.log(`\n=== ${baseMode} vs ${other} (${b.size} files) ===`);
  console.log(`only in ${baseMode}: ${onlyA.length}`); onlyA.slice(0, 15).forEach((f) => console.log(`  - ${f}`));
  console.log(`only in ${other}: ${onlyB.length}`); onlyB.slice(0, 15).forEach((f) => console.log(`  + ${f}`));
  let drift = 0;
  for (const [f, { lf }] of a) {
    if (b.has(f) && Math.abs(b.get(f).lf - lf) > Math.max(3, lf * 0.05)) {
      drift += 1;
      if (drift <= 10) console.log(`  ~ LF drift ${f}: ${lf} -> ${b.get(f).lf}`);
    }
  }
  console.log(`files with >5% total-line (LF) drift: ${drift}/${b.size}`);
}
