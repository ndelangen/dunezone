/**
 * Every file under `/public/` is a content-hashed browser bundle file, cached for a year without revalidation.
 * Asset-first routing answered a missing one with the single-page application's HTML document, status 200, under that same year-long immutable header, so a browser or the edge that asked for a chunk from the other side of a rollout kept HTML at a JavaScript URL and the app stayed blank on every ordinary reload (#2548).
 *
 * The Worker owns `/public/*` so it can tell the two apart: a stored file passes through with the immutable header, and anything else is a 404 nobody may keep.
 */
const BUNDLE_ASSET_PREFIX = '/public/';

const IMMUTABLE_BUNDLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function handleBundleAssetRequest(
  request: Request,
  url: URL,
  assets: Pick<Fetcher, 'fetch'>
): Promise<Response | undefined> {
  if (!url.pathname.startsWith(BUNDLE_ASSET_PREFIX)) {
    return undefined;
  }
  /*
   * The asset binding answers conditionals itself, and for a missing file it would compare them against the fallback document,
   * so a browser that kept that HTML from before #2548 would get a 304 for it, renewed for a year.
   * The binding gets an unconditional request; only a stored file's own ETag can answer a revalidation.
   */
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const response = await assets.fetch(new Request(request, { headers }));
  const stored = response.ok && !isDocument(response);
  if (!stored) {
    /* Not awaited: a tee'd body settles its cancel only once every branch is done. */
    void response.body?.cancel().catch(() => undefined);
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const etag = response.headers.get('ETag');
  if (etag && matchesEtag(request.headers.get('If-None-Match'), etag)) {
    void response.body?.cancel().catch(() => undefined);
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': IMMUTABLE_BUNDLE_CACHE_CONTROL },
    });
  }
  const delivered = new Response(response.body, response);
  delivered.headers.set('Cache-Control', IMMUTABLE_BUNDLE_CACHE_CONTROL);
  return delivered;
}

/** `If-None-Match` uses the weak comparison (RFC 9110 §13.1.2). */
function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => candidate.trim() === '*' || opaque(candidate) === opaque(etag));
}

function isDocument(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').toLowerCase().startsWith('text/html');
}
