import { describe, expect, test } from 'vite-plus/test';

import { handleBundleAssetRequest, IMMUTABLE_BUNDLE_CACHE_CONTROL } from './bundle-assets';

const ORIGIN = 'https://dune.zone';

function assets(response: Response) {
  const requests: string[] = [];
  return {
    requests,
    fetch: async (input: RequestInfo | URL) => {
      requests.push(new Request(input).url);
      return response.clone();
    },
  } as unknown as Fetcher & { requests: string[] };
}

async function get(path: string, fetcher: Fetcher) {
  const request = new Request(`${ORIGIN}${path}`);
  return handleBundleAssetRequest(request, new URL(request.url), fetcher);
}

describe('hashed bundle files', () => {
  test('leaves every other path to the rest of the Worker', async () => {
    const fetcher = assets(new Response('x'));
    expect(await get('/play', fetcher)).toBeUndefined();
    expect(await get('/publicity', fetcher)).toBeUndefined();
    expect(fetcher.requests).toEqual([]);
  });

  test('delivers a stored chunk under the year-long immutable header', async () => {
    const fetcher = assets(
      new Response('export {}', { headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'max-age=0' } })
    );
    const response = await get('/public/useLocation-BSsE2IVh.js', fetcher);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('text/javascript');
    expect(response?.headers.get('Cache-Control')).toBe(IMMUTABLE_BUNDLE_CACHE_CONTROL);
    expect(await response?.text()).toBe('export {}');
  });

  test('turns the single-page fallback for a missing chunk into an uncacheable 404', async () => {
    const fetcher = assets(
      new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    );
    const response = await get('/public/useLocation-OLDHASH0.js', fetcher);
    expect(response?.status).toBe(404);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Content-Type')).not.toContain('text/html');
  });

  test('never stores a failed asset read', async () => {
    const response = await get('/public/glossary-CMtIjJrP.js', assets(new Response('bad gateway', { status: 502 })));
    expect(response?.status).toBe(404);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  test('passes a revalidation answer through', async () => {
    const response = await get('/public/Tabs-abc.js', assets(new Response(null, { status: 304 })));
    expect(response?.status).toBe(304);
  });
});
