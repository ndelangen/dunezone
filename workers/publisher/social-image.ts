import { publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import { publisherErrorMessage } from '../../src/shared/asset-publishing/publisher-diagnostics';
import { parseSocialCard, SOCIAL_CARD_PATH, socialArtwork } from '../../src/shared/socialCard';
import type { SocialCardInput } from '../../src/shared/socialCard';
import { jpegProfile } from './image-inspection';

const MAX_ART_BYTES = 2_000_000;
const MAX_ART_PIXELS = 2_000_000;
type Render = (input: SocialCardInput, artwork: ArrayBuffer | null) => Promise<Uint8Array>;

async function artworkData(input: SocialCardInput, bucket: Pick<R2Bucket, 'get'>): Promise<ArrayBuffer | null> {
  const target = socialArtwork(input.art);
  if (!target) {
    return null;
  }
  try {
    /* A bounded direct read cannot call a metadata resolver or follow a caller-provided URL. */
    const object = await bucket.get(publishedR2Key(target.assetType, target.assetId), {
      range: { offset: 0, length: MAX_ART_BYTES + 1 },
    });
    if (!object) {
      return null;
    }
    if (object.size > MAX_ART_BYTES) {
      await object.body.cancel();
      return null;
    }
    const buffer = await object.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength > MAX_ART_BYTES) {
      return null;
    }
    const { widthPx, heightPx } = jpegProfile(bytes);
    if (widthPx < 1 || heightPx < 1 || widthPx > 2048 || heightPx > 2048 || widthPx * heightPx > MAX_ART_PIXELS) {
      return null;
    }
    return buffer;
  } catch {
    return null;
  }
}

async function render(input: SocialCardInput, artwork: ArrayBuffer | null) {
  const { renderSocialCard } = await import('./social-renderer');
  return renderSocialCard(input, artwork);
}

/** The PNG request needs only validated words, an existing JPEG and bundled fonts. */
export async function handleSocialImageRequest(
  request: Request,
  env: { ASSET_BUCKET: Pick<R2Bucket, 'get'> },
  renderer: Render = render
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/social' && !url.pathname.startsWith('/social/')) {
    return null;
  }
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (url.pathname !== SOCIAL_CARD_PATH) {
    return new Response('Not found', { status: 404, headers });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  const input = parseSocialCard(url);
  if (!input) {
    return new Response('Invalid social image input', { status: 400, headers });
  }
  try {
    const artwork = await artworkData(input, env.ASSET_BUCKET);
    const png = await renderer(input, artwork).catch((error: unknown) => {
      if (!artwork) {
        throw error;
      }
      return renderer(input, null);
    });
    return new Response(request.method === 'HEAD' ? null : png, {
      headers: { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(png.byteLength) },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'social_image_failed', error: publisherErrorMessage(error).slice(0, 300) }));
    return new Response('Social image temporarily unavailable', { status: 503, headers });
  }
}
