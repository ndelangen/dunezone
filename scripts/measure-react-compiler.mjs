import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { chromium } from 'playwright';

/* Compare two production Storybook builds with identical fixtures, alternating warm typing samples. */
const base = process.argv[2];
if (!base) {
  throw new Error(
    'Usage: bun scripts/measure-react-compiler.mjs <directory containing baseline-storybook and compiler-storybook>'
  );
}
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};
const servers = [];
const browser = await chromium.launch({ headless: true });
const results = { browser: browser.version(), cpuRate: 4, samples: [] };
const ports = {};
for (const variant of ['baseline', 'compiler']) {
  const root = join(base, `${variant}-storybook`);
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = join(root, pathname === '/' ? 'index.html' : pathname);
      await stat(file);
      res.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  ports[variant] = server.address().port;
  servers.push(server);
}
const stories = [
  { id: 'pages-factions--edit', field: 'Faction name' },
  { id: 'pages-rulesets-rulebooks--thirty-page-editor', field: 'Title' },
];
try {
  for (const story of stories) {
    const contexts = {};
    for (const variant of ['baseline', 'compiler']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      const js = new Map();
      const pending = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('.js')) {
          pending.push(
            response
              .body()
              .then((body) => js.set(response.url(), { raw: body.length, gzip: gzipSync(body).length }))
              .catch(() => {})
          );
        }
      });
      await page.goto(`http://127.0.0.1:${ports[variant]}/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: 'networkidle',
      });
      const field = page.getByRole('textbox', { name: story.field, exact: true });
      await field.waitFor({ timeout: 45_000 });
      await page.waitForTimeout(1800);
      const original = await field.inputValue();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await Promise.all(pending);
      const bytes = [...js.values()].reduce((a, b) => ({ raw: a.raw + b.raw, gzip: a.gzip + b.gzip }), {
        raw: 0,
        gzip: 0,
      });
      contexts[variant] = { context, page, field, cdp, original, errors, bytes };
    }
    for (let sample = 0; sample < 8; sample++) {
      for (const variant of sample % 2 ? ['compiler', 'baseline'] : ['baseline', 'compiler']) {
        const { page, field, cdp, original, errors, bytes } = contexts[variant];
        await field.fill(original);
        await field.press('End');
        await page.waitForTimeout(400);
        const before = Object.fromEntries(
          (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])
        );
        await field.pressSequentially(' measured compiler comparison', { delay: 30 });
        await page.waitForTimeout(350);
        const after = Object.fromEntries(
          (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])
        );
        if ((await field.inputValue()) !== original + ' measured compiler comparison') {
          throw new Error(`${variant} ${story.id} lost input`);
        }
        const row = {
          variant,
          story: story.id,
          sample,
          warmup: sample === 0,
          scriptMs: 1000 * (after.ScriptDuration - before.ScriptDuration),
          taskMs: 1000 * (after.TaskDuration - before.TaskDuration),
          layoutMs: 1000 * (after.LayoutDuration - before.LayoutDuration),
          jsBytes: bytes,
          errors,
        };
        results.samples.push(row);
        console.log(JSON.stringify(row));
      }
    }
    for (const { context } of Object.values(contexts)) {
      await context.close();
    }
  }
} finally {
  await writeFile(join(base, 'measurements.json'), JSON.stringify(results, null, 2));
  await browser.close();
  for (const server of servers) {
    server.close();
  }
}
