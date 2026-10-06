import { describe, expect, test, vi } from 'vitest';

import { handleApplicationRequest } from './application';

const env: Pick<Env, 'CF_VERSION_METADATA' | 'GIT_SHA'> = {
  CF_VERSION_METADATA: { id: 'release-a', tag: 'a', timestamp: 'today' },
  GIT_SHA: 'development',
};

describe('anonymous application dispatch', () => {
  test.each([
    '/',
    '/factions',
    '/rulesets',
    '/rulesets/dreamrules',
    '/rulesets/dreamrules/rulebooks/dream-rulebook',
    '/factions/testfaction/',
    '/assets',
    '/assets/token-disc',
    '/assets/card-treachery/lasgun',
    '/assets/unknown-type/missing',
    '/assets/create',
    '/assets/unknown-type/missing/extra',
    '/factions/missing/extra',
  ])('renders %s without visitor credentials', async (pathname) => {
    const render = vi.fn(async (request: Request) => {
      expect([...request.headers]).toEqual([['accept', 'text/html']]);
      expect(request.url).toBe(`https://dune.zone${pathname}?search=hello`);
      return new Response('public page', { headers: { 'Set-Cookie': 'unexpected=value' } });
    });
    const response = await handleApplicationRequest(
      new Request(`https://dune.zone${pathname}?search=hello`, {
        headers: { Cookie: 'auth=private', Authorization: 'Bearer private', 'X-Forwarded-Host': 'other.invalid' },
      }),
      env,
      render
    );
    expect(await response?.text()).toBe('public page');
    expect(response?.headers.get('Set-Cookie')).toBeNull();
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
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
    '/rulesets/%63reate',
    '/rulesets/dreamrules/edit',
    '/rulesets/dreamrules/rulebooks/create',
    '/rulesets/dreamrules/rulebooks/dream-rulebook/edit',
    '/rulesets/dreamrules/rulebooks/dream-rulebook/editions',
    '/rulesets/dreamrules/faq/create',
    '/groups',
    '/play',
    '/auth/login',
    '/preview/sheet/test',
    '/publisher-capture.html',
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
