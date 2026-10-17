import { afterEach, assert, expect, test, vi } from 'vite-plus/test';

import { handleAuthRequest } from './auth';

const env = {
  PUBLIC_BASE_URL: 'https://dune.zone',
  CONVEX_AUTH_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.site',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

test('keeps the provider redirect and each OAuth cookie on the browser response', async () => {
  const upstreamHeaders = new Headers({ Location: 'https://accounts.google.com/o/oauth2/v2/auth' });
  upstreamHeaders.append(
    'Set-Cookie',
    '__Host-googleOAuthpkce=pkce; Secure; HttpOnly; Path=/; SameSite=None; Partitioned'
  );
  upstreamHeaders.append(
    'Set-Cookie',
    '__Host-googleRedirectTo=%2F; Secure; HttpOnly; Path=/; SameSite=None; Partitioned'
  );
  const upstream = vi.fn(async (_request: Request) => new Response(null, { status: 302, headers: upstreamHeaders }));
  vi.stubGlobal('fetch', upstream);
  const response = await handleAuthRequest(
    new Request('https://dune.zone/auth/signin/google?code=verifier&redirectTo=%2F'),
    env
  );
  const forwarded = upstream.mock.calls[0]?.[0];
  assert(forwarded);
  assert(response);
  expect(forwarded.url).toBe(
    'https://exuberant-finch-263.eu-west-1.convex.site/api/auth/signin/google?code=verifier&redirectTo=%2F'
  );
  expect(forwarded.redirect).toBe('manual');
  expect(forwarded.cache).toBe('no-store');
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(response.headers.getSetCookie()).toEqual(upstreamHeaders.getSetCookie());
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
});

test("forwards a callback body and only that provider's OAuth cookies", async () => {
  let forwarded: Request | undefined;
  const upstream = vi.fn(async (request: Request) => {
    forwarded = request;
    expect(await request.text()).toBe('code=provider-code&state=provider-state');
    return new Response(null, { status: 302, headers: { Location: 'https://dune.zone/?code=app-code' } });
  });
  vi.stubGlobal('fetch', upstream);
  const response = await handleAuthRequest(
    new Request('https://dune.zone/auth/callback/discord', {
      method: 'POST',
      body: 'code=provider-code&state=provider-state',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie:
          '__Host-discordOAuthstate=state; analytics=private; __Host-googleOAuthpkce=other; __Host-discordRedirectTo=%2Fprofiles',
        Authorization: 'Bearer unrelated-token',
        'X-Forwarded-Host': 'attacker.example',
      },
    }),
    env
  );
  expect(forwarded?.method).toBe('POST');
  expect(forwarded?.url).toBe('https://exuberant-finch-263.eu-west-1.convex.site/api/auth/callback/discord');
  expect(forwarded?.headers.get('Cookie')).toBe('__Host-discordOAuthstate=state; __Host-discordRedirectTo=%2Fprofiles');
  expect(forwarded?.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
  expect(forwarded?.headers.has('Authorization')).toBe(false);
  expect(forwarded?.headers.has('X-Forwarded-Host')).toBe(false);
  expect(response?.headers.get('Location')).toBe('https://dune.zone/?code=app-code');
});

test('leaves the login page and future API routes to their own handlers', async () => {
  expect(await handleAuthRequest(new Request('https://dune.zone/auth/login'), env)).toBeNull();
  expect(await handleAuthRequest(new Request('https://dune.zone/api/auth/callback/google'), env)).toBeNull();
});

test('rejects unknown providers and noncanonical origins without sending credentials upstream', async () => {
  const upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
  expect((await handleAuthRequest(new Request('https://dune.zone/auth/callback/unknown'), env))?.status).toBe(404);
  expect((await handleAuthRequest(new Request('https://publisher.invalid/auth/callback/google'), env))?.status).toBe(
    404
  );
  expect(
    (await handleAuthRequest(new Request('https://dune.zone/auth/signin/google', { method: 'POST' }), env))?.status
  ).toBe(405);
  expect(upstream).not.toHaveBeenCalled();
});

test('returns an uncached retryable error when the backend is unreachable', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('private upstream details');
    })
  );
  const response = await handleAuthRequest(new Request('https://dune.zone/auth/callback/google?code=secret'), env);
  expect(response?.status).toBe(502);
  expect(response?.headers.get('Cache-Control')).toBe('no-store');
  expect(await response?.text()).not.toContain('private upstream details');
});
