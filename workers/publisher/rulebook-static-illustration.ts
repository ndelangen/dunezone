import { Buffer } from 'node:buffer';

import { RULEBOOK_STOCK_ARTWORK } from '../../src/shared/rulebooks/sources';
import { jpegProfile, pngDimensions } from './image-inspection';

const artworkIds = new Set<string>(RULEBOOK_STOCK_ARTWORK);
const MAX_BYTES = 2_000_000;
const MAX_DIMENSION = 20_000;

export type RulebookStaticIllustration = {
  imageDataUrl: string;
  width: number;
  height: number;
  revision: string;
};

async function boundedBytes(response: Response): Promise<Uint8Array | null> {
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES || !response.body) {
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    size += next.value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function webpDimensions(bytes: Uint8Array) {
  const tag = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
  if (bytes.byteLength < 30 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') {
    throw new Error('Invalid WebP illustration');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read24 = (offset: number) => bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
  if (tag(12) === 'VP8X') {
    return { widthPx: read24(24) + 1, heightPx: read24(27) + 1 };
  }
  if (tag(12) === 'VP8L' && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true);
    return { widthPx: (bits & 0x3f_ff) + 1, heightPx: ((bits >>> 14) & 0x3f_ff) + 1 };
  }
  if (tag(12) === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { widthPx: view.getUint16(26, true) & 0x3f_ff, heightPx: view.getUint16(28, true) & 0x3f_ff };
  }
  throw new Error('WebP illustration has no size header');
}

function svgDimensions(bytes: Uint8Array) {
  const svg = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  if (
    /<(?:[\w-]+:)?(?:script|foreignObject|iframe|style|animate\w*|set)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)|&/i.test(
      svg
    )
  ) {
    throw new Error('Unsafe static illustration');
  }
  const root = /<svg\b([^>]*)>/i.exec(svg)?.[1];
  const viewBox = root && /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (!viewBox) {
    throw new Error('Static illustration has no viewBox');
  }
  const [x, y, widthPx, heightPx, extra] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (extra !== undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Static illustration has an invalid viewBox');
  }
  return { widthPx: widthPx!, heightPx: heightPx! };
}

/** Loads only maintained artwork through the static binding and binds intrinsic size to these exact bytes. */
export async function loadRulebookStaticIllustration(
  artworkId: string,
  assets: Pick<Fetcher, 'fetch'>
): Promise<RulebookStaticIllustration | null> {
  if (!artworkIds.has(artworkId) || !/^\/(?:image|vector)\/[\w/-]+\.(?:svg|png|jpe?g|webp)$/.test(artworkId)) {
    return null;
  }
  try {
    const response = await assets.fetch(
      new Request(`https://rulebook-static.invalid${artworkId}`, { redirect: 'error' })
    );
    if (!response.ok) {
      return null;
    }
    const bytes = await boundedBytes(response);
    if (!bytes?.byteLength) {
      return null;
    }
    const extension = artworkId.split('.').at(-1);
    const contentType =
      extension === 'svg' ? 'image/svg+xml' : extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    const dimensions =
      extension === 'svg'
        ? svgDimensions(bytes)
        : extension === 'png'
          ? pngDimensions(bytes)
          : extension === 'webp'
            ? webpDimensions(bytes)
            : jpegProfile(bytes);
    const { widthPx: width, heightPx: height } = dimensions;
    if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= MAX_DIMENSION)) {
      return null;
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      imageDataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`,
      width,
      height,
      revision: Buffer.from(digest).toString('hex'),
    };
  } catch {
    return null;
  }
}
