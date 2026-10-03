/** The edge may evict sooner; browsers always revisit the Worker and then subscribe to live data. */
export const PUBLIC_CACHE_SECONDS = { html: 300, artwork: 3600, png: 86_400, fallback: 300 } as const;

export type PublicCache = {
  storage: Pick<Cache, 'match' | 'put' | 'delete'>;
  release: string;
};

/** Hash normalized public inputs so cache keys do not retain caller-supplied words. */
export async function publicCacheKey(
  url: URL,
  cache: PublicCache,
  kind: 'html' | 'png' | 'artwork' | 'sitemap'
): Promise<Request> {
  const normalized = new URL(url);
  normalized.hash = '';
  normalized.searchParams.sort();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized.href));
  const key = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request(`${url.origin}/__public-cache/${encodeURIComponent(cache.release)}/${kind}/${key}`);
}

/** Only explicit public successes can be stored, before any delivery headers are stripped. */
function canStore(response: Response): boolean {
  return (
    response.status === 200 &&
    !response.headers.has('Set-Cookie') &&
    !/\b(private|no-store|no-cache)\b/i.test(response.headers.get('Cache-Control') ?? '') &&
    !response.headers.has('Vary')
  );
}

export async function publicCachedResponse(
  cache: PublicCache | undefined,
  url: URL,
  kind: 'html' | 'png' | 'artwork' | 'sitemap',
  generate: () => Promise<Response>,
  lifetime: (response: Response) => number
): Promise<Response> {
  const key = cache ? await publicCacheKey(url, cache, kind) : undefined;
  let state = cache ? 'miss' : 'bypass';
  if (cache && key) {
    try {
      const hit = await cache.storage.match(key);
      if (hit) {
        return delivery(hit, 'hit');
      }
    } catch {
      state = 'error';
    }
  }
  const response = await generate();
  if (cache && key && canStore(response)) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', `public, max-age=${lifetime(response)}`);
    try {
      /* Await the write so a following HEAD or GET can reuse this response immediately. */
      await cache.storage.put(key, stored);
    } catch {
      state = 'error';
    }
  }
  return delivery(response, state);
}

function delivery(response: Response, state: string): Response {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'no-store');
  result.headers.set('X-Public-Cache', state);
  if (state === 'hit') {
    result.headers.set('X-Public-Metadata-Queries', '0');
    result.headers.set('X-Public-Renders', '0');
    result.headers.set('X-Public-Artwork-Reads', '0');
    if (result.headers.has('X-Public-Artwork-Cache')) {
      result.headers.set('X-Public-Artwork-Cache', 'not-needed');
    }
  }
  return result;
}
