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
export const BLOG_POST_SLUGS = [
  'editable-dune-board-arrakis',
  'dune-homebrew-art-ai-and-credits',
  'playing-dune-online-in-real-time',
  'anatomy-of-a-dune-faction-atreides',
  'building-a-dune-sandbox',
  'dune-board-game-style-guide',
  'drawing-dune-tokens-and-cards',
  'all-in-one-dune-board-game-webapp',
  'tabletop-simulator',
  'why-dune',
] as const;

export type BlogPostSlug = (typeof BLOG_POST_SLUGS)[number];

/**
 * Posts that are published but unlisted: their page renders for anyone with the link, with a robots `noindex`, while the post list and the sitemap leave them out.
 * Used to show a post to someone it mentions before it goes public.
 */
export const UNLISTED_BLOG_POST_SLUGS: ReadonlySet<BlogPostSlug> = new Set<BlogPostSlug>([]);

/** Each blog post's page, served under the blog's record-less root. */
export const BLOG_POST_PAGES = BLOG_POST_SLUGS.map((slug) => `/blog/${slug}`);

/** The blog post pages the landing sitemap lists: every post except the unlisted ones. */
export const LISTED_BLOG_POST_PAGES = BLOG_POST_SLUGS.filter((slug) => !UNLISTED_BLOG_POST_SLUGS.has(slug)).map(
  (slug) => `/blog/${slug}`
);
