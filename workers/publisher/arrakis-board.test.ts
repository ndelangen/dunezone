import { expect, test, vi } from 'vite-plus/test';

import { handleArrakisBoardRequest } from './arrakis-board';

const env: Pick<Env, 'CONVEX_CLOUD_BASE_URL'> = {
  CONVEX_CLOUD_BASE_URL: 'https://exuberant-finch-263.eu-west-1.convex.cloud',
};
const request = (path: string, method = 'GET') => new Request(`https://dune.zone${path}`, { method });
const board = { assetId: 'a1', name: 'Arrakis Official', revision: 'token-1.2026-10-01T00:00:00.000Z' };
const path = `/data/arrakis-board/${encodeURIComponent(board.revision)}.json`;

function storage() {
  const values = new Map<string, { body: ArrayBuffer; headers: Headers }>();
  return {
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
  };
}

test('answers other paths with null', async () => {
  expect(await handleArrakisBoardRequest(request('/data/other.json'), env, storage(), vi.fn())).toBeNull();
});

test('reads Convex once per revision and edge location, whatever the query string', async () => {
  const cache = storage();
  const load = vi.fn(async () => board);
  const first = await handleArrakisBoardRequest(request(path), env, cache, load);
  expect(first?.status).toBe(200);
  expect(first?.headers.get('X-Public-Cache')).toBe('miss');
  expect(first?.headers.get('Cache-Control')).toBe('public, max-age=86400');
  expect(await first?.json()).toEqual(board);
  const second = await handleArrakisBoardRequest(request(`${path}?utm=x`), env, cache, load);
  expect(second?.headers.get('X-Public-Cache')).toBe('hit');
  expect(await second?.json()).toEqual(board);
  expect(load).toHaveBeenCalledTimes(1);
});

test.each([
  ['another revision is current', { ...board, revision: 'token-2.2026-10-02T00:00:00.000Z' }],
  ['the site has no saved Arrakis', null],
])('stores nothing and answers 404 when %s, so the page falls back to its live query', async (_, answer) => {
  const cache = storage();
  const response = await handleArrakisBoardRequest(request(path), env, cache, async () => answer);
  expect(response?.status).toBe(404);
  expect(response?.headers.get('Cache-Control')).toBe('no-store');
  expect(cache.put).not.toHaveBeenCalled();
});

test('a failed Convex read is a retryable 503 and is not stored', async () => {
  const cache = storage();
  const response = await handleArrakisBoardRequest(request(path), env, cache, async () => {
    throw new Error('down');
  });
  expect(response?.status).toBe(503);
  expect(cache.put).not.toHaveBeenCalled();
});

test('refuses writes', async () => {
  expect((await handleArrakisBoardRequest(request(path, 'POST'), env, storage(), vi.fn()))?.status).toBe(405);
});

test('answers HEAD with headers only, on a miss and on a hit', async () => {
  const cache = storage();
  const load = vi.fn(async () => board);
  const miss = await handleArrakisBoardRequest(request(path, 'HEAD'), env, cache, load);
  expect(miss?.status).toBe(200);
  expect(await miss?.text()).toBe('');
  const hit = await handleArrakisBoardRequest(request(path, 'HEAD'), env, cache, load);
  expect(hit?.headers.get('X-Public-Cache')).toBe('hit');
  expect(await hit?.text()).toBe('');
});
