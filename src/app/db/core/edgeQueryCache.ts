import { PUBLIC_SITE_ORIGIN } from '@shared/publicDiscovery';

/**
 * Public query answers kept at the edge for a while, so server rendering and signed-out visitors read Convex at most once per answer and edge location in that time.
 * Convex's own cache holds an answer only while someone asks for it again within about five minutes, which this site's traffic rarely does.
 * Together with the five minutes the Worker keeps a page's HTML, a signed-out visitor's first paint is at most a quarter of an hour old;
 * the page's live subscriptions bring it up to date once it hydrates.
 */
export const EDGE_QUERY_SECONDS = 600;

/** The Convex functions behind an answer: a deploy that changes them, the shared code they import or their packages, starts afresh. */
const SOURCE_VERSION: string = import.meta.env.VITE_CONVEX_SOURCE_VERSION ?? 'unversioned';

/**
 * Only anonymous query calls share answers: an answer read with credentials could hold what one viewer may see.
 * The Convex HTTP client always calls with a URL and an init carrying a string body, so any other call passes through.
 */
function sharedQueryUrl(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (input instanceof Request || init?.method !== 'POST' || typeof init.body !== 'string') {
    return null;
  }
  const url = input instanceof URL ? input.href : input;
  const { hostname, pathname } = new URL(url);
  /* A local backend's data changes under the same source version, so a local Worker never keeps its answers. */
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  return pathname === '/api/query' && !local && !new Headers(init.headers).has('Authorization') ? url : null;
}

/**
 * Convex answers a failed query with 200 and `status: "error"`, so only successes are kept.
 * A `null` answer is not kept either: a page that finds nothing renders "not found" without a live subscription to correct it, so something created a moment ago would stay missing.
 */
function keepsAnswer(body: string): boolean {
  try {
    const envelope = JSON.parse(body) as { status?: unknown; value?: unknown };
    return envelope.status === 'success' && envelope.value !== null;
  } catch {
    return false;
  }
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
    const url = storage ? sharedQueryUrl(input, init) : null;
    if (!storage || url === null) {
      return await base(input, init);
    }
    const key = await keyFor(url, init!.body as string);
    const hit = await storage.match(key).catch(() => undefined);
    if (hit) {
      return hit;
    }
    const response = await base(input, init);
    if (!response.ok) {
      return response;
    }
    const body = await response.text();
    if (keepsAnswer(body)) {
      const stored = new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${EDGE_QUERY_SECONDS}` },
      });
      await storage.put(key, stored).catch(() => undefined);
    }
    return new Response(body, { status: response.status, headers: response.headers });
  };
}
