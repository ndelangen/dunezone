/**
 * Public pages with no record behind them: served by the Worker, rendered on the server, listed in the landing sitemap.
 * Imports nothing, so the Node-run release verification can load it directly.
 */
export const RECORDLESS_PUBLIC_PAGES = ['/glossary', '/future-plans', '/privacy', '/blog'];

/**
 * Record-less pages that no navigation links to yet, so the footer leaves them out;
 * every other one needs a footer link.
 * The blog waits here until it gets its place in the page header.
 */
export const UNLINKED_PUBLIC_PAGES = ['/blog'];

/**
 * The blog's posts, by path slug, newest first.
 * The posts themselves are code in `src/app/routes/_app/blog/posts`;
 * this list repeats their slugs so the sitemap can name them without loading the app, and a test keeps the two equal.
 */
export const BLOG_POST_SLUGS = ['a-blog-for-dune-zone'] as const;

export type BlogPostSlug = (typeof BLOG_POST_SLUGS)[number];

/** Each blog post's page, served under the blog's record-less root and listed in the landing sitemap. */
export const BLOG_POST_PAGES = BLOG_POST_SLUGS.map((slug) => `/blog/${slug}`);

/**
 * The media library's game galleries, by path slug.
 * The Topic and Lucide icon libraries stay browser-only, because they show third-party icon sets rather than Dune Zone artwork.
 */
export const MEDIA_GALLERY_SLUGS = ['decals', 'symbols', 'emblems', 'icons', 'troops', 'leaders', 'planets', 'covers'];

/** The media overview and its galleries, served like the record-less pages above but without their descendants. */
export const MEDIA_PUBLIC_PAGES = ['/media', ...MEDIA_GALLERY_SLUGS.map((slug) => `/media/game/${slug}`)];
