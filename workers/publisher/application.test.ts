import { describe, expect, test, vi } from 'vite-plus/test';

import { CONTRIBUTING_SUBPAGES } from '../../src/shared/recordlessPublicPages';
import { handleApplicationRequest } from './application';

const env: Pick<Env, 'CF_VERSION_METADATA' | 'GIT_SHA' | 'CONVEX_CLOUD_BASE_URL'> = {
  CF_VERSION_METADATA: { id: 'release-a', tag: 'a', timestamp: 'today' },
  GIT_SHA: 'development',
  CONVEX_CLOUD_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
};

describe('anonymous application dispatch', () => {
  test.each([
    '/',
    '/factions',
    '/rulesets',
    '/rulesets/dreamrules',
    '/rulesets/dreamrules/faq/1',
    '/profiles',
    '/profiles/central',
    '/groups/dreamers',
    '/rulesets/dreamrules/rulebooks/dream-rulebook',
    '/factions/testfaction/',
    '/assets',
    '/assets/token-disc',
    '/assets/card-treachery/lasgun',
    '/assets/create',
    '/assets/unknown-type/missing/extra',
    '/factions/missing/extra',
    '/glossary',
    '/contributing',
    ...CONTRIBUTING_SUBPAGES,
    '/faq',
    '/blog',
    '/blog/why-dune',
    '/media',
    '/media/game/leaders',
    '/media/missing',
  ])('renders %s without visitor credentials', async (pathname) => {
    const render = vi.fn(async (request: Request) => {
      expect(request.headers.get('Accept')).toBe('text/html');
      expect(request.headers.get('X-Application-Nonce')).toMatch(/^[a-f0-9]{32}$/);
      expect([...request.headers]).toHaveLength(2);
      expect(request.url).toBe(`https://dune.zone${pathname}?search=hello`);
      return new Response('public page', { headers: { 'Set-Cookie': 'unexpected=value' } });
    });
    const response = await handleApplicationRequest(
      new Request(`https://dune.zone${pathname}?search=hello`, {
        headers: {
          Cookie: 'auth=private',
          Authorization: 'Bearer private',
          'X-Forwarded-Host': 'other.invalid',
          'X-Application-Nonce': 'attacker-chosen',
        },
      }),
      env,
      render
    );
    expect(await response?.text()).toBe('public page');
    expect(response?.headers.get('Set-Cookie')).toBeNull();
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Content-Security-Policy')).toMatch(/script-src 'self'[^;]*'nonce-/);
    expect(response?.headers.get('X-Application-Render-Nonce')).toBeNull();
    expect(response?.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response?.headers.get('X-Application-Release')).toBe('release-a');
  });

  test.each([
    '/factions/create',
    '/factions/%63reate',
    '/factions/test/edit',
    '/assets/token-disc/create',
    '/assets/token-disc/test/edit',
    '/assets/__presets',
    '/rulesets/create',
    '/rulesets/dreamrules/edit',
    '/rulesets/dreamrules/rulebooks/create',
    '/rulesets/dreamrules/rulebooks/dream-rulebook/edit',
    '/rulesets/dreamrules/faq/create',
    '/groups',
    '/groups/create',
    '/groups/dreamers/edit',
    '/profiles/central/edit',
    '/play',
    '/media/topics',
    '/media/lucide',
    '/auth/login',
    '/factions/%',
    '/factions/a%2Fedit',
  ])('leaves %s to its existing owner', async (pathname) => {
    const render = vi.fn();
    expect(await handleApplicationRequest(new Request(`https://dune.zone${pathname}`), env, render)).toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  test('preserves failure status, strips HEAD bodies and never dispatches mutations', async () => {
    const render = vi.fn(async () => new Response('missing', { status: 404 }));
    const request = new Request('https://dune.zone/factions/missing', { method: 'HEAD' });
    const response = await handleApplicationRequest(request, env, render);
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe('');
    expect(await handleApplicationRequest(new Request(request, { method: 'POST' }), env, render)).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
