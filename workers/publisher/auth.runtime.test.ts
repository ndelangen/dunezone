import path from 'node:path';

import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { expect, test } from 'vite-plus/test';

test('workerd preserves OAuth cookies, callback bodies and redirects through the auth proxy', async () => {
  const bundle = await build({
    stdin: {
      contents: `import { handleAuthRequest } from './auth';
        export default { fetch(request, env) { return handleAuthRequest(request, env); } };`,
      resolveDir: import.meta.dirname,
      sourcefile: 'auth-runtime.ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  let requests = 0;
  const cookies = [
    '__Host-googleOAuthpkce=pkce; Secure; HttpOnly; Path=/; SameSite=None; Partitioned',
    '__Host-googleRedirectTo=%2F; Secure; HttpOnly; Path=/; SameSite=None; Partitioned',
  ];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: [
        {
          type: 'ESModule',
          path: path.join(import.meta.dirname, 'auth-runtime.js'),
          contents: bundle.outputFiles[0]!.text,
        },
      ],
      compatibilityDate: '2026-07-17',
      compatibilityFlags: ['nodejs_compat'],
      bindings: {
        PUBLIC_BASE_URL: 'https://dune.zone',
        CONVEX_AUTH_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.site',
      },
      outboundService: async (request) => {
        requests += 1;
        expect(new URL(request.url).pathname).toBe('/api/auth/callback/google');
        expect(request.headers.get('Cookie')).toBe('__Host-googleOAuthpkce=pkce');
        expect(await request.text()).toBe('code=provider-code');
        const headers = new Headers({ Location: 'https://dune.zone/?code=app-code' });
        for (const cookie of cookies) {
          headers.append('Set-Cookie', cookie);
        }
        return new Response(null, { status: 302, headers });
      },
    })
  );
  try {
    const response = await mf.dispatchFetch('https://dune.zone/auth/callback/google', {
      method: 'POST',
      body: 'code=provider-code',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: '__Host-googleOAuthpkce=pkce; analytics=private',
      },
    });
    expect(requests).toBe(1);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://dune.zone/?code=app-code');
    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  } finally {
    await mf.dispose();
  }
}, 20_000);
