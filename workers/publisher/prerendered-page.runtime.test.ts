import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, test } from 'vite-plus/test';

import { PRERENDERED_PAGE_NONCE } from '../../src/shared/recordlessPublicPages';

const page = '/tools/example-tool';

/** The publisher's application dispatch with this tool built, Static Assets holding its prerendered file and a public cache. */
const workerSource = `import { handleApplicationRequest } from './application';
  import { PRERENDERED_PAGE_NONCE, TOOL_PAGES } from '../../src/shared/recordlessPublicPages';
  TOOL_PAGES.push(${JSON.stringify(page)});
  const prerendered = '<html><head><meta property="csp-nonce" content="' + PRERENDERED_PAGE_NONCE + '"><script nonce="' + PRERENDERED_PAGE_NONCE + '">boot()</script></head><body>Example</body></html>';
  const ASSETS = {
    fetch: async (request) =>
      new URL(request.url).pathname === ${JSON.stringify(`${page}/index.html`)}
        ? new Response(prerendered, { headers: { 'Cache-Control': 'public, max-age=31536000' } })
        : new Response('missing', { status: 404 }),
  };
  async function render() {
    throw new Error('A prerendered page is never rendered on the server');
  }
  export default {
    async fetch(request, env) {
      const cache = { storage: await caches.open('public'), release: 'release-a' };
      return (await handleApplicationRequest(request, { ...env, ASSETS }, render, cache)) ?? new Response('unhandled', { status: 599 });
    },
  };`;

async function startWorker(): Promise<Miniflare> {
  const bundle = await build({
    stdin: { contents: workerSource, resolveDir: import.meta.dirname, sourcefile: 'prerendered-page-runtime.ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  return new Miniflare(
    convertV4MiniflareOptions({
      modules: [
        {
          type: 'ESModule',
          path: path.join(import.meta.dirname, 'prerendered-page-runtime.js'),
          contents: bundle.outputFiles[0]!.text,
        },
      ],
      compatibilityDate: '2026-07-17',
      compatibilityFlags: ['nodejs_compat'],
      bindings: {
        CF_VERSION_METADATA: { id: 'release-a', tag: 'a', timestamp: 'today' },
        GIT_SHA: 'development',
        CONVEX_CLOUD_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
      },
    })
  );
}

/** Checks one delivery's security headers and that its markup carries the fresh nonce in place of the placeholder, and returns that nonce. */
async function expectSecuredDelivery(
  response: Awaited<ReturnType<Miniflare['dispatchFetch']>>,
  cacheState: 'miss' | 'hit'
): Promise<string> {
  const html = await response.text();
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get('Content-Security-Policy')!)?.[1];
  expect(response.status).toBe(200);
  expect(nonce).toMatch(/^[a-f0-9]{32}$/);
  expect(nonce).not.toBe(PRERENDERED_PAGE_NONCE);
  expect(html).toContain(`<script nonce="${nonce}">boot()</script>`);
  expect(html).toContain(`<meta property="csp-nonce" content="${nonce}">`);
  expect(html).not.toContain(PRERENDERED_PAGE_NONCE);
  expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Application-Render-Nonce')).toBeNull();
  expect(response.headers.get('X-Application-Release')).toBe('release-a');
  expect(response.headers.get('X-Public-Cache')).toBe(cacheState);
  expect(response.headers.get('X-Public-Renders')).toBe('0');
  return nonce!;
}

test('workerd serves a prerendered tool page through the public cache, with a fresh nonce on every delivery and no server render', async () => {
  const mf = await startWorker();
  try {
    const first = await expectSecuredDelivery(await mf.dispatchFetch(`https://dune.zone${page}`), 'miss');
    const second = await expectSecuredDelivery(await mf.dispatchFetch(`https://dune.zone${page}`), 'hit');
    expect(second).not.toBe(first);
  } finally {
    await mf.dispose();
  }
  /* Bundling the publisher's application module and starting workerd take most of this on a short-on-CPU runner, as in auth.runtime.test.ts. */
}, 20_000);
