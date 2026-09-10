import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { RULEBOOK_STOCK_ARTWORK } from '../../src/shared/rulebooks/sources';
import { loadRulebookStaticIllustration } from './rulebook-static-illustration';
import { jpegBytes, pngBytes } from './test-helpers';

const svgId = RULEBOOK_STOCK_ARTWORK.find((id) => id.endsWith('.svg'))!;
const jpegId = RULEBOOK_STOCK_ARTWORK.find((id) => id.endsWith('.jpg'))!;
const pngId = RULEBOOK_STOCK_ARTWORK.find((id) => id.endsWith('.png'))!;

function staticBinding(body: string | Uint8Array, headers?: HeadersInit) {
  const fetch = vi.fn(async () => new Response(typeof body === 'string' ? body : new Uint8Array(body), { headers }));
  return { fetch, assets: { fetch } as unknown as Pick<Fetcher, 'fetch'> };
}

describe('maintained static illustrations', () => {
  it('binds exact SVG bytes and their intrinsic aspect ratio to the revision', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><path d="M0 0H300V180Z"/></svg>';
    const { fetch, assets } = staticBinding(svg);
    const result = await loadRulebookStaticIllustration(svgId, assets);
    expect(result).toMatchObject({
      width: 300,
      height: 180,
      revision: createHash('sha256').update(svg).digest('hex'),
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    });
    expect((fetch.mock.calls[0] as unknown as [Request])[0].url).toBe(`https://rulebook-static.invalid${svgId}`);
  });

  it('reads raster dimensions from the delivered bytes', async () => {
    const jpeg = staticBinding(jpegBytes({ widthPx: 900, heightPx: 1263, progressive: true }));
    const png = staticBinding(pngBytes(350, 210));
    expect(await loadRulebookStaticIllustration(jpegId, jpeg.assets)).toMatchObject({ width: 900, height: 1263 });
    expect(await loadRulebookStaticIllustration(pngId, png.assets)).toMatchObject({ width: 350, height: 210 });
  });

  it('rejects URLs, unknown paths and path modifiers without calling the static binding', async () => {
    const { fetch, assets } = staticBinding('unused');
    for (const id of ['https://example.com/image.png', '/image/missing.png', `${svgId}?x=1`, `${svgId}#root`]) {
      expect(await loadRulebookStaticIllustration(id, assets)).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    '<script>alert(1)</script>',
    '<image href="https://example.com/image.png"/>',
    '<path onload="alert(1)"/>',
    '<path fill="url(https://example.com/paint)"/>',
    '<use href="&#104;ttps://example.com/image.svg"/>',
  ])('rejects active content and external resources: %s', async (content) => {
    const { assets } = staticBinding(`<svg viewBox="0 0 100 100">${content}</svg>`);
    expect(await loadRulebookStaticIllustration(svgId, assets)).toBeNull();
  });

  it('bounds bytes and dimensions even when response headers cannot be trusted', async () => {
    const large = staticBinding(new Uint8Array(2_000_001));
    const invalid = staticBinding('<svg viewBox="0 0 Infinity 100"></svg>');
    expect(await loadRulebookStaticIllustration(pngId, large.assets)).toBeNull();
    expect(await loadRulebookStaticIllustration(svgId, invalid.assets)).toBeNull();
  });
});
