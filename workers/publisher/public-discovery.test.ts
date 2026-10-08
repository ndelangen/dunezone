import { expect, test, vi } from 'vitest';

import type { PublicCache } from './public-cache';
import { handlePublicDiscovery } from './public-discovery';

const env: Pick<Env, 'CONVEX_CLOUD_BASE_URL'> = {
  CONVEX_CLOUD_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
};
const request = (path: string, method = 'GET') => new Request(`https://dune.zone${path}`, { method });
function cache(): PublicCache {
  const values = new Map<string, { body: ArrayBuffer; headers: Headers }>();
  return {
    release: 'test',
    storage: {
      match: vi.fn(async (key: RequestInfo | URL) => {
        const hit = values.get(String(key instanceof Request ? key.url : key));
        return hit ? new Response(hit.body.slice(0), { headers: hit.headers }) : undefined;
      }),
      put: vi.fn(async (key: RequestInfo | URL, response: Response) => {
        values.set(String(key instanceof Request ? key.url : key), {
          body: await response.arrayBuffer(),
          headers: response.headers,
        });
      }),
      delete: vi.fn(async () => false),
    },
  };
}

test('the index and landing sitemap enumerate supported canonical paths without database calls', async () => {
  const load = vi.fn();
  const index = await handlePublicDiscovery(request('/sitemap.xml'), env, undefined, load);
  expect(index?.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
  const body = await index!.text();
  expect(body).toContain('<loc>https://dune.zone/sitemap-factions.xml</loc>');
  expect(body).toContain('<loc>https://dune.zone/sitemap-token-disc.xml</loc>');
  expect(body).toContain('<loc>https://dune.zone/sitemap-board.xml</loc>');
  const pages = await handlePublicDiscovery(request('/sitemap-pages.xml'), env, undefined, load);
  expect(await pages!.text()).toContain('<loc>https://dune.zone/assets/token-disc</loc>');
  expect(load).not.toHaveBeenCalled();
});

test('a complete paginated result is escaped and shared by GET, HEAD and tracking variants', async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce({
      entries: [{ pathname: '/factions/one', lastmod: '2026-01-01T00:00:00.000Z' }],
      cursor: 'next',
    })
    .mockResolvedValueOnce({ entries: [{ pathname: '/factions/a&b', lastmod: null }], cursor: null });
  const edge = cache();
  const result = await handlePublicDiscovery(request('/sitemap-factions.xml?tracking=1'), env, edge, load);
  const body = await result!.text();
  expect(body).toContain('/factions/a&amp;b');
  expect(body).toContain('<lastmod>2026-01-01T00:00:00.000Z</lastmod>');
  expect(result!.headers.get('X-Public-Metadata-Queries')).toBe('2');
  const head = await handlePublicDiscovery(request('/sitemap-factions.xml', 'HEAD'), env, edge, load);
  expect(await head!.text()).toBe('');
  expect(head!.headers.get('X-Public-Cache')).toBe('hit');
  expect(head!.headers.get('X-Public-Metadata-Queries')).toBe('0');
  expect(head!.headers.get('X-Robots-Tag')).toBe('noindex');
  const hit = await handlePublicDiscovery(request('/sitemap-factions.xml'), env, edge, load);
  expect(await hit!.text()).toBe(body);
  expect(load).toHaveBeenCalledTimes(2);
});

test('failed and non-advancing scans return retryable errors without caching partial XML', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const load of [
    vi.fn().mockRejectedValue(new Error('unavailable')),
    vi.fn().mockResolvedValue({ entries: [], cursor: 'stuck' }),
  ]) {
    const edge = cache();
    const result = await handlePublicDiscovery(request('/sitemap-factions.xml'), env, edge, load);
    expect(result!.status).toBe(503);
    expect(result!.headers.get('Retry-After')).toBe('300');
    expect(await result!.text()).not.toContain('<urlset');
    expect(edge.storage.put).not.toHaveBeenCalled();
  }
  log.mockRestore();
});

test('unsupported discovery paths and methods never fall through to the app shell', async () => {
  const load = vi.fn();
  expect((await handlePublicDiscovery(request('/sitemap-battle-wheel.xml'), env, undefined, load))!.status).toBe(404);
  expect((await handlePublicDiscovery(request('/sitemap.xml', 'POST'), env, undefined, load))!.status).toBe(405);
  expect(await handlePublicDiscovery(request('/factions'), env, undefined, load)).toBeNull();
  expect(load).not.toHaveBeenCalled();
});

test('an oversized collection fails instead of publishing its first fifty thousand URLs', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  let batch = 0;
  const load = vi.fn(async () => ({
    entries: Array.from({ length: 200 }, (_, index) => ({ pathname: `/factions/${batch}-${index}`, lastmod: null })),
    cursor: String(++batch),
  }));
  const edge = cache();
  const response = await handlePublicDiscovery(request('/sitemap-factions.xml'), env, edge, load);
  expect(response!.status).toBe(503);
  expect(load).toHaveBeenCalledTimes(251);
  expect(edge.storage.put).not.toHaveBeenCalled();
  log.mockRestore();
});
