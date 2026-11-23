import { readBoundedJson, runWithDeadline } from './http';

/**
 * The saved Arrakis board's data, one revision per URL, so pages read the board from the edge and Convex answers `arrakis:board` once per revision and edge location.
 * Pages learn the current revision from the small `arrakis:reference` subscription.
 * A day's lifetime at the edge, and a day more in a browser, bounds how long an edit that did not change the board's `updated_at` (a migration, say) could stay unseen.
 */
const ARRAKIS_BOARD_DATA_SECONDS = 86_400;

/** Data, never a page: browsers do not sniff it and search engines do not index it. */
const DATA_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' };

const ROUTE = /^\/data\/arrakis-board\/([^/]+)\.json$/;
const MAX_BYTES = 2_000_000;

type LoadBoard = (signal: AbortSignal) => Promise<{ revision?: unknown } | null>;

function loadFromConvex(env: Pick<Env, 'CONVEX_CLOUD_BASE_URL'>): LoadBoard {
  return async (signal) => {
    const response = await fetch(new URL('/api/query', env.CONVEX_CLOUD_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'arrakis:board', args: {}, format: 'json' }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Arrakis board query failed');
    }
    const envelope = (await readBoundedJson(response, MAX_BYTES, signal)) as { status?: unknown; value?: unknown };
    if (envelope.status !== 'success') {
      throw new Error('Arrakis board query failed');
    }
    return envelope.value as { revision?: unknown } | null;
  };
}

export async function handleArrakisBoardRequest(
  request: Request,
  env: Pick<Env, 'CONVEX_CLOUD_BASE_URL'>,
  storage: Pick<Cache, 'match' | 'put'> | undefined,
  load: LoadBoard = loadFromConvex(env)
): Promise<Response | null> {
  const url = new URL(request.url);
  const encoded = ROUTE.exec(url.pathname)?.[1];
  if (encoded === undefined) {
    return null;
  }
  const uncached = { 'Cache-Control': 'no-store', ...DATA_HEADERS };
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...uncached, Allow: 'GET, HEAD' } });
  }
  let revision: string;
  try {
    revision = decodeURIComponent(encoded);
  } catch {
    return new Response(null, { status: 404, headers: uncached });
  }
  /* Query strings do not change the answer, so they do not split the cache either. */
  const key = new Request(`${url.origin}/__public-cache/arrakis-board/${encodeURIComponent(revision)}`);
  const hit = await storage?.match(key).catch(() => undefined);
  if (hit) {
    return withState(hit, 'hit', request.method);
  }
  let board: { revision?: unknown } | null;
  try {
    board = await runWithDeadline(Date.now() + 10_000, load);
  } catch {
    console.error(JSON.stringify({ event: 'arrakis_board_failed' }));
    return new Response(null, { status: 503, headers: { ...uncached, 'Retry-After': '30' } });
  }
  /* Another revision is current (or none is): the page falls back to its live query, and nothing is stored under a name it does not answer. */
  if (!board || board.revision !== revision) {
    /* Every visit pays for a miss, so a reference that keeps naming a revision the board does not answer shows in the logs. */
    console.warn(
      JSON.stringify({
        event: 'arrakis_board_revision_mismatch',
        requested: revision,
        current: board?.revision ?? null,
      })
    );
    return new Response(null, { status: 404, headers: uncached });
  }
  const response = new Response(JSON.stringify(board), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ARRAKIS_BOARD_DATA_SECONDS}`,
      ...DATA_HEADERS,
    },
  });
  await storage?.put(key, response.clone()).catch(() => undefined);
  return withState(response, 'miss', request.method);
}

function withState(response: Response, state: 'hit' | 'miss', method: string): Response {
  const result = new Response(method === 'HEAD' ? null : response.body, response);
  result.headers.set('X-Public-Cache', state);
  return result;
}
