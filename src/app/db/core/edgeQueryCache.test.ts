import { expect, test, vi } from 'vite-plus/test';

import { EDGE_QUERY_SECONDS, edgeCachedFetch } from './edgeQueryCache';
import type { Fetch } from './edgeQueryCache';

const url = 'https://exuberant-finch-263.eu-west-1.convex.cloud/api/query';
const body = JSON.stringify({
  path: 'factions:detailPage',
  format: 'convex_encoded_json',
  args: [{ slug: 'atreides' }],
});
const query = (init: RequestInit = {}) => ({
  method: 'POST',
  body,
  headers: { 'Content-Type': 'application/json' },
  ...init,
});

function storage() {
  const values = new Map<string, Response>();
  return {
    values,
    match: vi.fn(async (key: RequestInfo | URL) => values.get(key instanceof Request ? key.url : String(key))?.clone()),
    put: vi.fn(async (key: RequestInfo | URL, response: Response) => {
      values.set(key instanceof Request ? key.url : String(key), response);
    }),
  };
}

const answering = (payload: unknown, status = 200) => vi.fn<Fetch>(async () => Response.json(payload, { status }));

test('answers a repeated anonymous query from the edge, for ten minutes', async () => {
  const cache = storage();
  const base = answering({ status: 'success', value: { name: 'Atreides' } });
  const cachedFetch = edgeCachedFetch(cache, base);
  expect(await (await cachedFetch(url, query())).json()).toEqual({ status: 'success', value: { name: 'Atreides' } });
  expect(await (await cachedFetch(url, query())).json()).toEqual({ status: 'success', value: { name: 'Atreides' } });
  expect(base).toHaveBeenCalledTimes(1);
  expect([...cache.values.values()][0]!.headers.get('Cache-Control')).toBe(`public, max-age=${EDGE_QUERY_SECONDS}`);
});

test('keeps different arguments apart', async () => {
  const base = answering({ status: 'success', value: 1 });
  const cachedFetch = edgeCachedFetch(storage(), base);
  await cachedFetch(url, query());
  await cachedFetch(url, query({ body: body.replace('atreides', 'harkonnen') }));
  expect(base).toHaveBeenCalledTimes(2);
});

test.each([
  ['an authenticated call', query({ headers: { Authorization: 'Bearer token' } })],
  ['a mutation', query()],
])('never shares %s', async (name, init) => {
  const cache = storage();
  const base = answering({ status: 'success', value: 1 });
  const target = name === 'a mutation' ? url.replace('query', 'mutation') : url;
  const cachedFetch = edgeCachedFetch(cache, base);
  await cachedFetch(target, init);
  await cachedFetch(target, init);
  expect(base).toHaveBeenCalledTimes(2);
  expect(cache.put).not.toHaveBeenCalled();
});

test.each([
  ['a failed query', { status: 'error', errorMessage: 'nope' }, 200],
  [
    'an answer that found nothing, which a page would show as missing until it expires',
    { status: 'success', value: null },
    200,
  ],
  ['a server error', { message: 'down' }, 500],
])('does not keep %s', async (_, payload, status) => {
  const cache = storage();
  const cachedFetch = edgeCachedFetch(cache, answering(payload, status));
  expect((await cachedFetch(url, query())).status).toBe(status);
  expect(cache.put).not.toHaveBeenCalled();
});

test('is plain fetch where there is no edge cache', async () => {
  const base = answering({ status: 'success', value: 1 });
  const cachedFetch = edgeCachedFetch(undefined, base);
  await cachedFetch(url, query());
  await cachedFetch(url, query());
  expect(base).toHaveBeenCalledTimes(2);
});

test('a broken cache only costs the cache', async () => {
  const base = answering({ status: 'success', value: 1 });
  const broken = {
    match: vi.fn(async () => {
      throw new Error('cache down');
    }),
    put: vi.fn(async () => {
      throw new Error('cache down');
    }),
  };
  expect((await (await edgeCachedFetch(broken, base)(url, query())).json()).value).toBe(1);
});

test('never keeps a local backend’s answers, whose data changes under the same source version', async () => {
  const cache = storage();
  const base = answering({ status: 'success', value: 1 });
  await edgeCachedFetch(cache, base)('http://127.0.0.1:3210/api/query', query());
  expect(cache.put).not.toHaveBeenCalled();
});
