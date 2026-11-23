import { PUBLIC_SITE_ORIGIN } from '@shared/publicDiscovery';

/**
 * Public query answers kept at the edge for a while, so server rendering and signed-out visitors read Convex at most once per answer and edge location in that time.
 * Convex's own cache holds an answer only while someone asks for it again within about five minutes, which this site's traffic rarely does.
 * Signed-out visitors may see an answer up to `EDGE_QUERY_SECONDS` old;
 * signed-in visitors subscribe live and never read these.
 */
export const EDGE_QUERY_SECONDS = 900;

/** The Convex functions behind an answer: a deploy that changes them, or the shared code they import, starts afresh. */
const SOURCE_VERSION: string = import.meta.env.VITE_CONVEX_SOURCE_VERSION ?? 'unversioned';

/** Only anonymous query calls share answers: an answer read with credentials could hold what one viewer may see. */
function isSharedQuery(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
  return (
    (init?.method ?? (input instanceof Request ? input.method : 'GET')) === 'POST' &&
    url.pathname === '/api/query' &&
    !headers.has('Authorization') &&
    typeof init?.body === 'string'
  );
}

async function keyFor(url: string, body: string): Promise<Request> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${url}\n${body}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  /* Under the site's own origin, beside the Worker's other cache keys (`/__public-cache/`). */
  return new Request(`${PUBLIC_SITE_ORIGIN}/__edge-query/${encodeURIComponent(SOURCE_VERSION)}/${hex}`);
}

/**
 * A `fetch` for the anonymous Convex HTTP client that answers query calls from the edge cache, and stores successful answers there for `EDGE_QUERY_SECONDS`.
 * Outside a Cloudflare Worker (no `caches`), and for anything but an anonymous query call, it is plain `fetch`.
 * A failure to read or write the cache only costs the cache.
 */
export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function edgeCachedFetch(
  storage: Pick<Cache, 'match' | 'put'> | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default,
  base: Fetch = fetch
): Fetch {
  return async (input, init) => {
    if (!storage || !isSharedQuery(input, init)) {
      return await base(input, init);
    }
    const key = await keyFor(input instanceof Request ? input.url : String(input), init!.body as string);
    const hit = await storage.match(key).catch(() => undefined);
    if (hit) {
      return hit;
    }
    const response = await base(input, init);
    if (!response.ok) {
      return response;
    }
    const body = await response.text();
    /* Convex answers a failed query with 200 and `status: "error"`; only successes are kept. */
    let success = false;
    try {
      success = (JSON.parse(body) as { status?: unknown }).status === 'success';
    } catch {
      success = false;
    }
    if (success) {
      const stored = new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${EDGE_QUERY_SECONDS}` },
      });
      await storage.put(key, stored).catch(() => undefined);
    }
    return new Response(body, { status: response.status, headers: response.headers });
  };
}
