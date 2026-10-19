import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { chromium } from 'playwright';
import { expect, test } from 'vite-plus/test';

import { applicationContentSecurityPolicy } from '../workers/publisher/application-security';

/* Exercise native HTMLRewriter and Chromium enforcement, including delivery from the real edge cache. */
test('CSP permits trusted startup and blocks injected scripts and foreign connections on cache hits', async () => {
  const allowedBackend = createServer((_request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end('allowed');
  });
  await new Promise<void>((resolve) => allowedBackend.listen(0, '127.0.0.1', resolve));
  const backendAddress = allowedBackend.address();
  if (!backendAddress || typeof backendAddress === 'string') {
    throw new Error('Missing backend address');
  }
  const backend = `http://127.0.0.1:${backendAddress.port}`;
  const bundled = await build({
    stdin: {
      contents: `import { handleApplicationRequest } from './application';
        export default { async fetch(request, env) {
          return handleApplicationRequest(request, env, async (request, nonce) => new Response(
            '<!doctype html><html><head><meta property="csp-nonce" content="' + nonce + '"></head><body>' +
            '<script nonce="' + nonce + '">window.trusted = true</script>' +
            '<script>window.injected = true</script>' +
            '<script nonce="untrusted">window.untrusted = true</script>' +
            '<img id="bad-image" src="/missing" onerror="window.handler = true">' +
            '</body></html>', { headers: { 'Content-Type': 'text/html' } }),
            { storage: caches.default, release: 'csp-test' });
        }};`,
      resolveDir: path.resolve(import.meta.dirname, '../workers/publisher'),
      sourcefile: 'csp-runtime.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: [
        {
          type: 'ESModule',
          path: path.join(import.meta.dirname, 'csp-runtime.js'),
          contents: bundled.outputFiles[0]!.text,
        },
      ],
      compatibilityDate: '2026-07-17',
      bindings: { CONVEX_CLOUD_BASE_URL: backend, GIT_SHA: 'csp-test' },
    })
  );
  const hashSource = 'window.trusted = true';
  const hash = `'sha256-${createHash('sha256').update(hashSource).digest('base64')}'`;
  const server = createServer(async (request, response) => {
    if (request.url === '/hash-shell') {
      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Security-Policy', applicationContentSecurityPolicy(backend, [hash]));
      response.end(`<script>${hashSource}</script><script>window.injected = true</script>`);
      return;
    }
    if (request.url === '/same-origin.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end('window.sameOrigin = true');
      return;
    }
    if (request.url === '/missing') {
      response.writeHead(404).end();
      return;
    }
    const delivered = await worker.dispatchFetch(`https://dune.zone${request.url}`);
    response.writeHead(delivered.status, Object.fromEntries(delivered.headers));
    response.end(Buffer.from(await delivered.arrayBuffer()));
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing application address');
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const policies: string[] = [];
    const cacheStates: (string | undefined)[] = [];
    for (let visit = 0; visit < 2; visit += 1) {
      const response = await page.goto(`http://127.0.0.1:${address.port}/`);
      const headers = await response!.allHeaders();
      policies.push(headers['content-security-policy']);
      cacheStates.push(headers['x-public-cache']);
      expect(headers['x-application-render-nonce']).toBeUndefined();
      expect(
        await page.evaluate(() => ({
          trusted: Reflect.get(window, 'trusted'),
          injected: Reflect.get(window, 'injected'),
          untrusted: Reflect.get(window, 'untrusted'),
          handler: Reflect.get(window, 'handler'),
          nonce: document.querySelector('meta[property="csp-nonce"]')?.getAttribute('content'),
        }))
      ).toMatchObject({ trusted: true, injected: undefined, untrusted: undefined, handler: undefined });
      const nonce = await page.locator('meta[property="csp-nonce"]').getAttribute('content');
      expect(policies[visit]).toContain(`'nonce-${nonce}'`);
      expect(
        await page.evaluate(async (backend) => {
          const allowed = await fetch(backend).then((response) => response.text());
          const blocked = await fetch('https://blocked.invalid/token').then(
            () => false,
            () => true
          );
          let evaluationBlocked = false;
          try {
            // oxlint-disable-next-line no-eval -- This assertion verifies that CSP rejects string execution.
            window.eval('window.evaluated = true');
          } catch {
            evaluationBlocked = true;
          }
          return { allowed, blocked, evaluationBlocked };
        }, backend)
      ).toEqual({ allowed: 'allowed', blocked: true, evaluationBlocked: true });
      await page.addScriptTag({ url: `http://127.0.0.1:${address.port}/same-origin.js` });
      expect(await page.evaluate(() => Reflect.get(window, 'sameOrigin'))).toBe(true);
      await expect(page.addScriptTag({ url: 'https://blocked.invalid/script.js' })).rejects.toThrow();
    }
    expect(cacheStates).toEqual(['miss', 'hit']);
    expect(policies[0]).not.toBe(policies[1]);
    await page.goto(`http://127.0.0.1:${address.port}/hash-shell`);
    expect(
      await page.evaluate(() => ({
        trusted: Reflect.get(window, 'trusted'),
        injected: Reflect.get(window, 'injected'),
      }))
    ).toEqual({ trusted: true, injected: undefined });
  } finally {
    await browser?.close();
    await worker.dispose();
    server.closeAllConnections();
    allowedBackend.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => allowedBackend.close(() => resolve())),
    ]);
  }
}, 30_000);
