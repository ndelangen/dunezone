import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, test } from 'vite-plus/test';

import { PRERENDERED_PAGE_NONCE } from '../../src/shared/recordlessPublicPages';

test('workerd serves a prerendered tool page with a fresh nonce and the page security headers, without a server render', async () => {
  const page = '/tools/example-tool';
  const bundle = await build({
    stdin: {
      contents: `import { handleApplicationRequest } from './application';
        import { PRERENDERED_PAGE_NONCE, TOOL_PAGES } from '../../src/shared/recordlessPublicPages';
        TOOL_PAGES.push(${JSON.stringify(page)});
        const prerendered = '<html><head><meta property="csp-nonce" content="' + PRERENDERED_PAGE_NONCE + '"><script nonce="' + PRERENDERED_PAGE_NONCE + '">boot()</script></head><body>Example</body></html>';
        const ASSETS = {
          fetch: async (request) =>
            new URL(request.url).pathname === ${JSON.stringify(`${page}/index.html`)}
              ? new Response(prerendered, { headers: { 'Cache-Control': 'public, max-age=31536000' } })
              : new Response('missing', { status: 404 }),
        };
        export default {
          async fetch(request, env) {
            const response = await handleApplicationRequest(request, { ...env, ASSETS }, async () => {
              throw new Error('A prerendered page is never rendered on the server');
            });
            return response ?? new Response('unhandled', { status: 599 });
          },
        };`,
      resolveDir: import.meta.dirname,
      sourcefile: 'prerendered-page-runtime.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  const mf = new Miniflare(
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
  try {
    const response = await mf.dispatchFetch(`https://dune.zone${page}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    const nonce = /'nonce-([^']+)'/.exec(response.headers.get('Content-Security-Policy')!)?.[1];
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(nonce).not.toBe(PRERENDERED_PAGE_NONCE);
    expect(html).toContain(`<script nonce="${nonce}">boot()</script>`);
    expect(html).toContain(`<meta property="csp-nonce" content="${nonce}">`);
    expect(html).not.toContain(PRERENDERED_PAGE_NONCE);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Application-Render-Nonce')).toBeNull();
    expect(response.headers.get('X-Application-Release')).toBe('release-a');
  } finally {
    await mf.dispose();
  }
}, 20_000);
