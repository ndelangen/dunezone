import { z } from 'zod';

import { PUBLIC_SITE_ORIGIN, SITEMAP_COLLECTIONS, sitemapPageSchema } from '../../src/shared/publicDiscovery';
import type { SitemapArgs, SitemapPage } from '../../src/shared/publicDiscovery';
import { readBoundedJson, runWithDeadline } from './http';
import { publicCachedResponse, PUBLIC_CACHE_SECONDS } from './public-cache';
import type { PublicCache } from './public-cache';

const MAX_URLS = 50_000;
const MAX_BYTES = 8_000_000;
const MAX_BATCHES = 500;
const envelope = z.object({ status: z.literal('success'), value: sitemapPageSchema });
type LoadPage = (args: SitemapArgs, signal: AbortSignal) => Promise<SitemapPage>;

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!
  );
}

function location(pathname: string): string {
  return `<loc>${escapeXml(new URL(pathname, PUBLIC_SITE_ORIGIN).href)}</loc>`;
}

function document(kind: 'sitemapindex' | 'urlset', contents: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${kind} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${contents}</${kind}>\n`;
}

function loadFromConvex(env: Pick<Env, 'CONVEX_CLOUD_BASE_URL'>): LoadPage {
  return async (args, signal) => {
    const response = await fetch(new URL('/api/query', env.CONVEX_CLOUD_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'publicSitemap:page', args, format: 'json' }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Sitemap query failed');
    }
    return envelope.parse(await readBoundedJson(response, 1_000_000, signal)).value;
  };
}

async function collectionXml(collection: string, load: LoadPage, signal: AbortSignal): Promise<Response> {
  const entries: string[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  let cursor: string | null = null;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const page = await load({ collection, cursor }, signal);
    for (const entry of page.entries) {
      const xml = `<url>${location(entry.pathname)}${entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}</url>`;
      bytes += encoder.encode(xml).byteLength;
      entries.push(xml);
      if (entries.length > MAX_URLS || bytes > MAX_BYTES) {
        throw new Error('Sitemap capacity exceeded');
      }
    }
    if (page.cursor === null) {
      return xmlResponse(document('urlset', entries.join('')), batch + 1);
    }
    if (page.cursor === cursor) {
      throw new Error('Sitemap pagination did not advance');
    }
    cursor = page.cursor;
  }
  throw new Error('Sitemap batch limit exceeded');
}

function xmlResponse(body: string, queries = 0): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'X-Public-Metadata-Queries': String(queries),
    },
  });
}

/** Each collection has its own cache and bounded scan, independent of catalogue page requests. */
export async function handlePublicDiscovery(
  request: Request,
  env: Pick<Env, 'CONVEX_CLOUD_BASE_URL'>,
  cache?: PublicCache,
  load: LoadPage = loadFromConvex(env)
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/sitemap')) {
    return null;
  }
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  const collection = /^\/sitemap-(.+)\.xml$/.exec(url.pathname)?.[1];
  if (url.pathname !== '/sitemap.xml' && collection !== 'pages' && !SITEMAP_COLLECTIONS.includes(collection ?? '')) {
    return new Response(null, { status: 404, headers });
  }
  /* Tracking parameters and visitor credentials do not change discovery. */
  url.search = '';
  const response = await publicCachedResponse(
    cache,
    url,
    'sitemap',
    async () => {
      if (url.pathname === '/sitemap.xml') {
        return xmlResponse(
          document(
            'sitemapindex',
            ['pages', ...SITEMAP_COLLECTIONS]
              .map((name) => `<sitemap>${location(`/sitemap-${name}.xml`)}</sitemap>`)
              .join('')
          )
        );
      }
      if (collection === 'pages') {
        return xmlResponse(
          document(
            'urlset',
            [
              '/factions',
              '/assets',
              ...SITEMAP_COLLECTIONS.filter((name) => name !== 'factions').map((type) => `/assets/${type}`),
            ]
              .map((path) => `<url>${location(path)}</url>`)
              .join('')
          )
        );
      }
      try {
        return await runWithDeadline(
          Date.now() + 30_000,
          async (signal) => await collectionXml(collection!, load, signal)
        );
      } catch {
        /* Never publish a truncated sitemap or log document contents and cursors. */
        console.error(JSON.stringify({ event: 'public_sitemap_failed' }));
        return new Response('Sitemap temporarily unavailable', {
          status: 503,
          headers: { ...headers, 'Retry-After': '300' },
        });
      }
    },
    () => PUBLIC_CACHE_SECONDS.html
  );
  if (request.method === 'HEAD') {
    await response.body?.cancel();
    return new Response(null, response);
  }
  return response;
}
