/**
 * Public pages with no record behind them: served by the Worker, rendered on the server, listed in the landing sitemap.
 * Imports nothing, so the Node-run release verification can load it directly.
 */
export const RECORDLESS_PUBLIC_PAGES = ['/glossary', '/future-plans', '/privacy'];
