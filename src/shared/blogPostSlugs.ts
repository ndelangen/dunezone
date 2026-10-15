/*
 * The blog's posts, apart from the other record-less pages, so publishing a post leaves the files the hosted play flows read untouched.
 * The publisher Worker reads this list only for the landing sitemap, which no hosted flow requests (`scripts/lib/hosted-play-closure.ts`).
 * Imports nothing, so the Node-run release verification can load it directly.
 */

/**
 * The blog's posts, by path slug, newest first.
 * The posts themselves are code in `src/app/routes/_app/blog/posts`;
 * this list repeats their slugs so the sitemap can name them without loading the app, and a test keeps the two equal.
 */
export const BLOG_POST_SLUGS = ['all-in-one-dune-board-game-webapp', 'tabletop-simulator', 'why-dune'] as const;

export type BlogPostSlug = (typeof BLOG_POST_SLUGS)[number];

/** Each blog post's page, served under the blog's record-less root and listed in the landing sitemap. */
export const BLOG_POST_PAGES = BLOG_POST_SLUGS.map((slug) => `/blog/${slug}`);
