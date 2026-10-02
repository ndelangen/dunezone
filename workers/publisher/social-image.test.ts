import { describe, expect, test, vi } from 'vitest';

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
  test('reads only one bounded R2 object and passes JPEG data to the renderer', async () => {
    const bytes = jpegBytes({ widthPx: 600, heightPx: 600, progressive: true });
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(object(bytes));
    const render = vi.fn().mockResolvedValue(pngBytes(1200, 630));
    const response = await handleSocialImageRequest(request(), { ASSET_BUCKET: { get } }, render);
    expect(get).toHaveBeenCalledExactlyOnceWith('faction-tokens/k171dpxhhgjn9x3qmnhtywn33s848xq7/token.jpg', {
      range: { offset: 0, length: 2_000_001 },
    });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test' }),
      expect.stringMatching(/^data:image\/jpeg;base64,/)
    );
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
      expect(render).toHaveBeenCalledWith(expect.anything(), '');
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
