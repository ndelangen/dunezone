import { PUBLIC_CACHE_SECONDS, publicCachedResponse } from './public-cache';
import type { PublicCache } from './public-cache';

/** A deployed version owns its HTML, including the client chunk URLs in that HTML. */
export function applicationReleaseIdentity(env: Pick<Env, 'CF_VERSION_METADATA' | 'GIT_SHA'>): string {
  return env.CF_VERSION_METADATA?.id ?? env.GIT_SHA;
}

function isPublicPage(pathname: string): boolean {
  let segments: string[];
  try {
    segments = decodeURIComponent(pathname).replace(/\/$/, '').split('/').slice(1);
  } catch {
    return false;
  }
  if (segments.some((segment) => !segment || segment.includes('\\'))) {
    return false;
  }
  const [root, type, slug] = segments;
  if (root === 'factions') {
    return !((segments.length === 2 && type === 'create') || (segments.length === 3 && slug === 'edit'));
  }
  return root === 'assets' && isPublicAssetPage(segments);
}

function isPublicAssetPage(segments: string[]): boolean {
  const [, type, slug, action] = segments;
  return !(
    (segments.length === 2 && type === '__presets') ||
    (segments.length === 3 && slug === 'create') ||
    (segments.length === 4 && action === 'edit')
  );
}

/** Only anonymous public document reads cross into the application server. */
export async function handleApplicationRequest(
  request: Request,
  env: Pick<Env, 'CF_VERSION_METADATA' | 'GIT_SHA'>,
  render: (request: Request) => Promise<Response>,
  cache?: PublicCache
): Promise<Response | null> {
  if (!['GET', 'HEAD'].includes(request.method) || !isPublicPage(new URL(request.url).pathname)) {
    return null;
  }
  const response = await publicCachedResponse(
    cache,
    new URL(request.url),
    'html',
    async () => {
      const result = await render(
        new Request(request.url, {
          headers: { Accept: 'text/html' },
          signal: request.signal,
        })
      );
      const publicResult = new Response(result.body, result);
      publicResult.headers.set('X-Public-Renders', '1');
      return publicResult;
    },
    () => PUBLIC_CACHE_SECONDS.html
  );
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Application-Release', applicationReleaseIdentity(env));
  if (request.method === 'HEAD') {
    await response.body?.cancel();
  }
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
