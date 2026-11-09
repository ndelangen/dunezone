import { PRERENDERED_PAGE_NONCE, RECORDLESS_PUBLIC_PAGES, TOOL_PAGES } from '../../src/shared/recordlessPublicPages';
import { CACHED_NONCE_HEADER, secureApplicationResponse } from './application-security';
import { PUBLIC_CACHE_SECONDS, publicCachedResponse } from './public-cache';
import type { PublicCache } from './public-cache';

/** A deployed version owns its HTML, including the client chunk URLs in that HTML. */
export function applicationReleaseIdentity(env: Pick<Env, 'CF_VERSION_METADATA' | 'GIT_SHA'>): string {
  return env.CF_VERSION_METADATA?.id ?? env.GIT_SHA;
}

function isPublicPage(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }
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
  /* The tiles' pictures beside the tools (`/tools/<name>.webp`) stay static assets; every other path below /tools renders a page or the router's 404. */
  if (root === 'tools') {
    return !segments.at(-1)!.includes('.');
  }
  /* Unknown descendants reach the router's 404, as under every other public root. */
  if (RECORDLESS_PUBLIC_PAGES.includes(`/${root}`)) {
    return true;
  }
  /* The Topic and Lucide icon libraries stay in the browser-only shell; every other media path renders a page or the 404. */
  if (root === 'media') {
    return type !== 'topics' && type !== 'lucide';
  }
  if (root === 'factions') {
    return !((segments.length === 2 && type === 'create') || (segments.length === 3 && slug === 'edit'));
  }
  if (root === 'profiles') {
    return segments.length === 1 || segments.length === 2;
  }
  /* The tutorials: both catalogues and every page below them; the Play chapters' tile stills beside them stay static assets. */
  if (root === 'create') {
    return true;
  }
  if (root === 'tutorial') {
    return segments.length === 1 || (segments.length === 2 && !type!.includes('.'));
  }
  /* The global FAQ: one page, whose search and page number ride in the query string. */
  if (root === 'faq') {
    return segments.length === 1;
  }
  if (root === 'groups') {
    return segments.length === 2 && type !== 'create';
  }
  if (root === 'rulesets') {
    return (
      segments.length === 1 ||
      (segments.length === 2 && type !== 'create') ||
      (segments.length === 4 && (slug === 'rulebooks' || slug === 'faq') && segments[3] !== 'create')
    );
  }
  return root === 'assets' && isPublicAssetPage(segments);
}

function isPublicAssetPage(segments: string[]): boolean {
  const [, , slug, action] = segments;
  return !((segments.length === 3 && slug === 'create') || (segments.length === 4 && action === 'edit'));
}

/**
 * A built tool's page as the build prerendered it (`tools/<slug>/index.html`), marked with its placeholder nonce for delivery to replace.
 * Only the canonical address with no query is served from the build;
 * any other spelling goes to the server render, which redirects it to the canonical address.
 * Static Assets answer a missing file with the app shell, so a file without the placeholder nonce is not the page, and the server renders it instead.
 */
async function prerenderedPage(url: URL, assets: Fetcher | undefined): Promise<Response | null> {
  if (!assets || url.search || !TOOL_PAGES.includes(url.pathname)) {
    return null;
  }
  const file = await assets.fetch(new Request(new URL(`${url.pathname}/index.html`, url)));
  const html = file.ok ? await file.text() : (await file.body?.cancel(), '');
  if (!html.includes(`nonce="${PRERENDERED_PAGE_NONCE}"`)) {
    return null;
  }
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Public-Renders': '0',
      [CACHED_NONCE_HEADER]: PRERENDERED_PAGE_NONCE,
    },
  });
}

function decodedPathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** Only anonymous public document reads cross into the application server. */
export async function handleApplicationRequest(
  request: Request,
  env: Pick<Env, 'CF_VERSION_METADATA' | 'GIT_SHA' | 'CONVEX_CLOUD_BASE_URL'> & Partial<Pick<Env, 'ASSETS'>>,
  render: (request: Request, nonce: string) => Promise<Response>,
  cache?: PublicCache
): Promise<Response | null> {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return null;
  }
  const url = new URL(request.url);
  /* A prerendered tool page is only ever delivered at its own address, with its security headers and a fresh nonce. */
  const prerenderedFile = /^(\/tools\/[^/]+)\/index\.html$/i.exec(decodedPathname(url.pathname))?.[1];
  if (prerenderedFile && TOOL_PAGES.includes(prerenderedFile)) {
    return Response.redirect(new URL(prerenderedFile + url.search, url).href, 301);
  }
  if (!isPublicPage(url.pathname)) {
    return null;
  }
  const response = await publicCachedResponse(
    cache,
    url,
    'html',
    async () => {
      const prerendered = await prerenderedPage(url, env.ASSETS);
      if (prerendered) {
        return prerendered;
      }
      const nonce = crypto.randomUUID().replaceAll('-', '');
      const result = await render(
        new Request(request.url, {
          headers: { Accept: 'text/html', 'X-Application-Nonce': nonce },
          signal: request.signal,
        }),
        nonce
      );
      const publicResult = new Response(result.body, result);
      publicResult.headers.set('X-Public-Renders', '1');
      publicResult.headers.set(CACHED_NONCE_HEADER, nonce);
      return publicResult;
    },
    () => PUBLIC_CACHE_SECONDS.html
  );
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Application-Release', applicationReleaseIdentity(env));
  if (request.method === 'HEAD') {
    await response.body?.cancel();
  }
  return secureApplicationResponse(
    new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
    env.CONVEX_CLOUD_BASE_URL,
    request.url
  );
}
