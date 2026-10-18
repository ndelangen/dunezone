/**
 * Public pages with no record behind them: served by the Worker, rendered on the server, listed in the landing sitemap.
 * Imports nothing, so the Node-run release verification can load it directly.
 */
export const RECORDLESS_PUBLIC_PAGES = ['/glossary', '/contributing', '/future-plans', '/privacy', '/blog'];

/** Guide chapters linked from the contributing overview, each with its own public address. */
export const CONTRIBUTING_SUBPAGES = [
  '/contributing/code',
  '/contributing/deployment',
  '/contributing/glossary',
  '/contributing/design-decisions',
];

/**
 * Record-less pages the page header links to, so the footer leaves them out;
 * every other one needs a footer link.
 */
export const HEADER_PUBLIC_PAGES = ['/blog'];

/**
 * The media library's game galleries, by path slug.
 * The Topic and Lucide icon libraries stay browser-only, because they show third-party icon sets rather than Dune Zone artwork.
 */
export const MEDIA_GALLERY_SLUGS = ['decals', 'symbols', 'emblems', 'icons', 'troops', 'leaders', 'planets', 'covers'];

/** The media overview and its galleries, served like the record-less pages above but without their descendants. */
export const MEDIA_PUBLIC_PAGES = ['/media', ...MEDIA_GALLERY_SLUGS.map((slug) => `/media/game/${slug}`)];
