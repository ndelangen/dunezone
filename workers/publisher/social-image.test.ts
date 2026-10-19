import { describe, expect, test, vi } from 'vite-plus/test';

import { socialCardHref } from '../../src/shared/socialCard';
import { handleSocialImageRequest } from './social-image';
import { fakeR2Object, jpegBytes, pngBytes } from './test-helpers';

const image = '/published/faction-tokens/k171dpxhhgjn9x3qmnhtywn33s848xq7/token.jpg';
const path = socialCardHref({ name: 'Test', kind: 'Faction', description: '', image });
const request = (pathValue = path, method = 'GET') => new Request(`https://dune.zone${pathValue}`, { method });
function object(bytes: Uint8Array, size = bytes.byteLength): R2ObjectBody {
  const response = new Response(bytes);
  return {
    ...fakeR2Object({ etag: 'jpeg', size, uploaded: new Date(0) }),
    writeHttpMetadata() {},
    body: response.body!,
    bodyUsed: false,
    arrayBuffer: () => response.arrayBuffer(),
    bytes: () => response.bytes(),
    text: () => response.text(),
    json: () => response.json(),
    blob: () => response.blob(),
  };
}

describe('social PNG delivery', () => {
  test.each([
    { widthPx: 1948, heightPx: 1948, size: 2_500_000, fallback: false },
    { widthPx: 1948, heightPx: 1948, size: 3_000_001, fallback: true },
    { widthPx: 1949, heightPx: 1948, size: 2_500_000, fallback: true },
  ])(
    'uses the board publication bounds: $widthPx x $heightPx, $size bytes',
    async ({ widthPx, heightPx, size, fallback }) => {
      const bytes = jpegBytes({ widthPx, heightPx, progressive: true });
      const get = vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes, size));
      const render = vi.fn().mockResolvedValue(pngBytes(1200, 630));
      const href = socialCardHref({
        name: 'Arrakis with Palace',
        kind: 'Board',
        description: '',
        image: '/published/boards/abcdefghijklmnop/board.jpg',
      });
      const response = await handleSocialImageRequest(request(href), { ASSET_BUCKET: { get } }, render);
      expect(get).toHaveBeenCalledExactlyOnceWith('boards/abcdefghijklmnop/board.jpg', {
        range: { offset: 0, length: 3_000_001 },
      });
      expect(response?.headers.get('X-Public-Fallback')).toBe(String(fallback));
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Arrakis with Palace' }),
        fallback ? null : bytes.buffer
      );
    }
  );

  test('keeps the two-million-pixel bound for other artwork', async () => {
    const bytes = jpegBytes({ widthPx: 1948, heightPx: 1948, progressive: true });
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes));
    const render = vi.fn().mockResolvedValue(pngBytes(1200, 630));
    const response = await handleSocialImageRequest(request(), { ASSET_BUCKET: { get } }, render);
    expect(response?.headers.get('X-Public-Fallback')).toBe('true');
    expect(render).toHaveBeenCalledWith(expect.anything(), null);
  });

  test('reads only one bounded R2 object and passes JPEG data to the renderer', async () => {
    const bytes = jpegBytes({ widthPx: 600, heightPx: 600, progressive: true });
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes));
    const render = vi.fn().mockResolvedValue(pngBytes(1200, 630));
    const response = await handleSocialImageRequest(request(), { ASSET_BUCKET: { get } }, render);
    expect(get).toHaveBeenCalledExactlyOnceWith('faction-tokens/k171dpxhhgjn9x3qmnhtywn33s848xq7/token.jpg', {
      range: { offset: 0, length: 2_000_001 },
    });
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test' }), bytes.buffer);
    expect(response!.status).toBe(200);
    expect(response!.headers.get('Content-Type')).toBe('image/png');
    expect(response!.headers.get('Cache-Control')).toBe('no-store');
    expect((await response!.arrayBuffer()).byteLength).toBe(24);
  });

  test.each(['missing', 'oversize', 'pixels', 'invalid', 'outage'])(
    'uses branded fallback for %s artwork',
    async (condition) => {
      const get = vi.fn<R2Bucket['get']>();
      if (condition === 'missing') {
        get.mockResolvedValue(null);
      } else if (condition === 'outage') {
        get.mockRejectedValue(new Error('R2 unavailable'));
      } else {
        get.mockResolvedValue(
          object(
            condition === 'invalid'
              ? new Uint8Array(10)
              : jpegBytes({ widthPx: condition === 'pixels' ? 65_535 : 600, heightPx: 600, progressive: true }),
            condition === 'oversize' ? 2_000_001 : undefined
          )
        );
      }
      const render = vi.fn().mockResolvedValue(pngBytes(1200, 630));
      expect((await handleSocialImageRequest(request(), { ASSET_BUCKET: { get } }, render))!.status).toBe(200);
      expect(render).toHaveBeenCalledWith(expect.anything(), null);
    }
  );

  test('rejects invalid fields before I/O or rendering and owns its namespace', async () => {
    const get = vi.fn<R2Bucket['get']>();
    const render = vi.fn();
    const env = { ASSET_BUCKET: { get } };
    expect((await handleSocialImageRequest(request(path + '&name=again'), env, render))!.status).toBe(400);
    expect((await handleSocialImageRequest(request(path, 'POST'), env, render))!.status).toBe(405);
    expect((await handleSocialImageRequest(request('/social/unknown'), env, render))!.status).toBe(404);
    expect(await handleSocialImageRequest(request('/factions'), env, render)).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  test('HEAD has the PNG headers without a body', async () => {
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(null);
    const response = await handleSocialImageRequest(request(path, 'HEAD'), { ASSET_BUCKET: { get } }, async () =>
      pngBytes(1200, 630)
    );
    expect(response!.headers.get('Content-Length')).toBe('24');
    expect(await response!.text()).toBe('');
  });
});

test.each([
  {
    image: '/published/rulebooks/abcdefghijklmnop/first-page.jpg',
    key: 'rulebooks/abcdefghijklmnop/first-page.jpg',
    bucket: 'ASSET_BUCKET',
  },
  { image: '/user-images/' + 'a'.repeat(64) + '.jpg', key: 'a'.repeat(64) + '.jpg', bucket: 'USER_IMAGE_BUCKET' },
  {
    image: '/m/efda3b20bc25196a8b9b.85e0cb5d2b.jpg',
    key: 'v/efda3b20bc25196a8b9b.85e0cb5d2b.jpg',
    bucket: 'MEDIA_BUCKET',
  },
] as const)('reads the cover from its own bucket: $image', async ({ image, key, bucket }) => {
  const bytes = jpegBytes({ widthPx: 840, heightPx: 1188, progressive: true });
  const buckets = {
    ASSET_BUCKET: { get: vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes)) },
    USER_IMAGE_BUCKET: { get: vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes)) },
    MEDIA_BUCKET: { get: vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes)) },
  };
  const render = vi.fn().mockResolvedValue(pngBytes(1200, 630));
  const href = socialCardHref({ name: 'Dreamrules', kind: 'Rulebook', description: 'Edition 2', image });
  const response = await handleSocialImageRequest(request(href), buckets, render);
  expect(response?.headers.get('X-Public-Fallback')).toBe('false');
  for (const [name, { get }] of Object.entries(buckets)) {
    if (name === bucket) {
      expect(get).toHaveBeenCalledExactlyOnceWith(key, { range: { offset: 0, length: 2_000_001 } });
    } else {
      expect(get).not.toHaveBeenCalled();
    }
  }
  expect(render).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dreamrules' }), bytes.buffer);
});
