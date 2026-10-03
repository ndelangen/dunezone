import { publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import { parseSocialCard, SOCIAL_CARD_PATH, socialArtwork, socialCardPath } from '../../src/shared/socialCard';
import type { SocialCardInput } from '../../src/shared/socialCard';
import { jpegProfile } from './image-inspection';
import { PUBLIC_CACHE_SECONDS, publicCachedResponse, publicCacheKey } from './public-cache';
import type { PublicCache } from './public-cache';

const MAX_ART_BYTES = 2_000_000;
const MAX_ART_PIXELS = 2_000_000;
/* A slot covers artwork I/O and rasterization; there is no unbounded render queue. */
let activeRenders = 0;
const MAX_ACTIVE_RENDERS = 2;
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
  env: { ASSET_BUCKET: Pick<R2Bucket, 'get'>; SOCIAL_RENDER_RATE_LIMIT?: Pick<RateLimit, 'limit'> },
  renderer: Render = render,
  cache?: PublicCache
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
  const response = await publicCachedResponse(
    cache,
    new URL(socialCardPath(input), url.origin),
    'png',
    async () => {
      if (activeRenders >= MAX_ACTIVE_RENDERS) {
        return new Response('Social image renderer is busy', {
          status: 503,
          headers: { ...headers, 'Retry-After': '10' },
        });
      }
      activeRenders += 1;
      try {
        if (
          env.SOCIAL_RENDER_RATE_LIMIT &&
          !(await env.SOCIAL_RENDER_RATE_LIMIT.limit({ key: 'social-render' })).success
        ) {
          return new Response('Too many social image renders', {
            status: 429,
            headers: { ...headers, 'Retry-After': '10' },
          });
        }
        const artworkUrl = new URL(
          `${input.art || '/social/no-art'}?revision=${encodeURIComponent(input.revision)}`,
          url.origin
        );
        const art = await publicCachedResponse(
          input.art ? cache : undefined,
          artworkUrl,
          'artwork',
          async () => {
            const data = await artworkData(input, env.ASSET_BUCKET);
            return new Response(data, {
              status: data ? 200 : 404,
              headers: { 'X-Public-Artwork-Reads': input.art ? '1' : '0' },
            });
          },
          () => PUBLIC_CACHE_SECONDS.artwork
        );
        const artwork = art.ok ? await art.arrayBuffer() : null;
        let fallback = !artwork;
        let renders = 1;
        const png = await renderer(input, artwork).catch(async (error: unknown) => {
          if (!artwork) {
            throw error;
          }
          if (cache) {
            try {
              await cache.storage.delete(await publicCacheKey(artworkUrl, cache, 'artwork'));
            } catch {
              /* A cache outage must not prevent the branded fallback from being returned. */
            }
          }
          fallback = true;
          renders += 1;
          return renderer(input, null);
        });
        return new Response(png, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(png.byteLength),
            'X-Content-Type-Options': 'nosniff',
            'X-Public-Fallback': String(fallback),
            'X-Public-Metadata-Queries': '0',
            'X-Public-Renders': String(renders),
            'X-Public-Artwork-Reads': art.headers.get('X-Public-Artwork-Reads') ?? '0',
            'X-Public-Artwork-Cache': art.headers.get('X-Public-Cache') ?? 'bypass',
          },
        });
      } catch {
        /* Renderer errors can contain caller text; only the bounded event name is logged. */
        console.error(JSON.stringify({ event: 'social_image_failed' }));
        return new Response('Social image temporarily unavailable', { status: 503, headers });
      } finally {
        activeRenders -= 1;
      }
    },
    (result) =>
      result.headers.get('X-Public-Fallback') === 'true' ? PUBLIC_CACHE_SECONDS.fallback : PUBLIC_CACHE_SECONDS.png
  );
  if (request.method === 'HEAD') {
    await response.body?.cancel();
    return new Response(null, response);
  }
  return response;
}
