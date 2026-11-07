import { describe, expect, test } from 'vite-plus/test';

import { handleBundleAssetRequest } from './bundle-assets';

const ORIGIN = 'https://dune.zone';

function assets(response: Response) {
  const requests: string[] = [];
  const conditionals: (string | null)[] = [];
  return {
    requests,
    conditionals,
    fetch: async (input: RequestInfo | URL) => {
      const request = new Request(input);
      requests.push(request.url);
      conditionals.push(request.headers.get('If-None-Match'));
      return response.clone();
    },
  } as unknown as Fetcher & { requests: string[]; conditionals: (string | null)[] };
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
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
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

  test('answers a revalidation of a stored chunk from its own ETag', async () => {
    const fetcher = assets(
      new Response('export {}', { headers: { 'Content-Type': 'text/javascript', ETag: '"chunk"' } })
    );
    const request = new Request(`${ORIGIN}/public/Tabs-abc.js`, { headers: { 'If-None-Match': 'W/"chunk"' } });
    const response = await handleBundleAssetRequest(request, new URL(request.url), fetcher);
    expect(response?.status).toBe(304);
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(fetcher.conditionals).toEqual([null]);
  });

  test('never confirms HTML a browser kept at a missing chunk address', async () => {
    /* The binding would compare the conditional against the fallback document and answer 304; it never sees one. */
    const fetcher = assets(
      new Response('<!doctype html><html></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"index"' },
      })
    );
    const request = new Request(`${ORIGIN}/public/useLocation-OLDHASH0.js`, {
      headers: { 'If-None-Match': '"index"' },
    });
    const response = await handleBundleAssetRequest(request, new URL(request.url), fetcher);
    expect(response?.status).toBe(404);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(fetcher.conditionals).toEqual([null]);
  });
});
