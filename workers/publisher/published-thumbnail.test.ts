import { describe, expect, test } from 'vite-plus/test';

import type { PublicAssetCache } from './delivery';
import { handlePublishedThumbnailRequest } from './published-thumbnail';

const CARD = 'https://dune.zone/published/cards/j57c8t9m2q4w6e8r0y2u4i6o8p0a2s4d/card.jpg';
const ORIGINAL = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const RESIZED = new Uint8Array([9, 9]);

function context() {
  const pending: Promise<unknown>[] = [];
  return { pending, waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
}

function memoryCache(): PublicAssetCache & { entries: Map<string, Response> } {
  const entries = new Map<string, Response>();
  return {
    entries,
    async match(request) {
      return entries.get(request.url)?.clone();
    },
    async put(request, response) {
      entries.set(request.url, response);
    },
  };
}

function imagesStub(seen: unknown[], fail = false) {
  const transformer = {
    transform(options: unknown) {
      seen.push(options);
      return transformer;
    },
    async output(options: unknown) {
      seen.push(options);
      if (fail) {
        throw new Error('9422: transformation limit');
      }
      return { image: () => new Response(RESIZED).body, contentType: () => 'image/webp' };
    },
  };
  return { input: () => transformer } as unknown as Pick<ImagesBinding, 'input'>;
}

function original(etag = '"abc"') {
  const requests: Request[] = [];
  const handler = async (request: Request) => {
    requests.push(request);
    return new Response(ORIGINAL, {
      status: 200,
      headers: { ETag: etag, 'Content-Type': 'image/jpeg', 'Last-Modified': 'Fri, 06 Nov 2026 10:00:00 GMT' },
    });
  };
  return { requests, handler };
}

describe('handlePublishedThumbnailRequest', () => {
  test('leaves requests without a width to ordinary delivery', async () => {
    const source = original();
    const result = await handlePublishedThumbnailRequest(new Request(`${CARD}?v=1`), context(), source.handler, {
      images: imagesStub([]),
      cache: memoryCache(),
    });
    expect(result).toBeNull();
    expect(source.requests).toHaveLength(0);
  });

  test('refuses a width outside the list', async () => {
    const result = await handlePublishedThumbnailRequest(new Request(`${CARD}?w=300`), context(), original().handler, {
      images: imagesStub([]),
      cache: memoryCache(),
    });
    expect(result?.status).toBe(400);
  });

  test('resizes the whole original to WebP and keeps it at the edge under the original ETag', async () => {
    const seen: unknown[] = [];
    const cache = memoryCache();
    const ctx = context();
    const source = original();
    const request = new Request(`${CARD}?v=1&w=160`, { headers: { Range: 'bytes=0-1' } });
    const result = await handlePublishedThumbnailRequest(request, ctx, source.handler, {
      images: imagesStub(seen),
      cache,
    });
    await Promise.all(ctx.pending);

    expect(source.requests[0]?.url).toBe(`${CARD}?v=1`);
    expect(source.requests[0]?.headers.get('Range')).toBeNull();
    expect(seen).toEqual([
      { width: 160, fit: 'scale-down' },
      { format: 'image/webp', quality: 82 },
    ]);
    expect(result?.status).toBe(200);
    expect(result?.headers.get('Content-Type')).toBe('image/webp');
    expect(result?.headers.get('ETag')).toBe('"160-abc"');
    expect(new Uint8Array(await result!.arrayBuffer())).toEqual(RESIZED);
    expect([...cache.entries.keys()]).toEqual([
      'https://dune.zone/published/cards/j57c8t9m2q4w6e8r0y2u4i6o8p0a2s4d/card.jpg?w=160&etag=%22abc%22',
    ]);
  });

  test('serves a kept resize without resizing again, and answers a matching revalidation with 304', async () => {
    const cache = memoryCache();
    const first = context();
    await handlePublishedThumbnailRequest(new Request(`${CARD}?w=160`), first, original().handler, {
      images: imagesStub([]),
      cache,
    });
    await Promise.all(first.pending);

    const seen: unknown[] = [];
    const hit = await handlePublishedThumbnailRequest(new Request(`${CARD}?w=160`), context(), original().handler, {
      images: imagesStub(seen),
      cache,
    });
    expect(seen).toEqual([]);
    expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(RESIZED);

    const revalidated = await handlePublishedThumbnailRequest(
      new Request(`${CARD}?w=160`, { headers: { 'If-None-Match': '"160-abc"' } }),
      context(),
      original().handler,
      { images: imagesStub([]), cache }
    );
    expect(revalidated?.status).toBe(304);
  });

  test('a republished original misses the old resize', async () => {
    const cache = memoryCache();
    const first = context();
    await handlePublishedThumbnailRequest(new Request(`${CARD}?w=160`), first, original('"old"').handler, {
      images: imagesStub([]),
      cache,
    });
    await Promise.all(first.pending);
    const seen: unknown[] = [];
    const result = await handlePublishedThumbnailRequest(
      new Request(`${CARD}?w=160`),
      context(),
      original('"new"').handler,
      {
        images: imagesStub(seen),
        cache,
      }
    );
    expect(seen).toHaveLength(2);
    expect(result?.headers.get('ETag')).toBe('"160-new"');
  });

  test('serves the original bytes when the resize fails', async () => {
    const result = await handlePublishedThumbnailRequest(new Request(`${CARD}?w=160`), context(), original().handler, {
      images: imagesStub([], true),
      cache: memoryCache(),
    });
    expect(result?.status).toBe(200);
    expect(result?.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await result!.arrayBuffer())).toEqual(ORIGINAL);
  });

  test('passes an unavailable original through', async () => {
    const result = await handlePublishedThumbnailRequest(
      new Request(`${CARD}?w=160`),
      context(),
      async () => new Response('Not Found', { status: 404 }),
      { images: imagesStub([]), cache: memoryCache() }
    );
    expect(result?.status).toBe(404);
  });
});
