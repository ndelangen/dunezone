import { resolveAsset } from '@shared/media/resolveAsset';
import { BLOG_POST_SLUGS } from '@shared/recordlessPublicPages';
import type { BlogPostSlug } from '@shared/recordlessPublicPages';
import { formatStableDate } from '@ui/content/dates';

/*
 * What the post list, the page head and the sitemap know about each post, without its body.
 * Bodies live in `postBodies.ts`, which only the post page's component imports, so no other page downloads them.
 */

export type BlogPostMeta = {
  /** The last segment of the post's address. */
  slug: BlogPostSlug;
  title: string;
  /** The publication date, as `YYYY-MM-DD`. */
  date: string;
  author: string;
  /** One or two sentences for the post list, the search snippet and the social card. */
  summary: string;
  /**
   * A raster key from `media/`, resolved through the media pipeline, with its height over width.
   * It is the image in the post's structured data, and the post shows it with `Figure`.
   */
  cover: { key: string; alt: string; aspect: number };
};

/**
 * Every published post's metadata, by slug.
 * Publishing a post is adding its slug to `BLOG_POST_SLUGS`, its metadata here, and its body to `postBodies.ts`;
 * the types refuse a slug that is missing from either.
 * A body file under `posts/` is named for its slug, never `index.tsx` or `*.route.tsx`, which the router would read as a page.
 */
export const BLOG_POST_META: Record<BlogPostSlug, BlogPostMeta> = {
  'a-blog-for-dune-zone': {
    slug: 'a-blog-for-dune-zone',
    title: 'A blog for Dune Zone',
    date: '2026-10-14',
    author: 'Norbert de Langen',
    summary:
      'Dune Zone now has a developer blog, where we look back at the ideas, experiments and decisions behind the site.',
    cover: { key: '/web/homepage/board.png', alt: 'The Dune Zone game board', aspect: 1420 / 3000 },
  },
};

/** Every published post, newest first, in the order of `BLOG_POST_SLUGS`. */
export const BLOG_POSTS: readonly BlogPostMeta[] = BLOG_POST_SLUGS.map((slug) => BLOG_POST_META[slug]);

export function findBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

/** The date and author line the post list and the post page both show above a title. */
export function blogPostByline(meta: BlogPostMeta): string {
  return `${formatStableDate(meta.date)} · ${meta.author}`;
}

/** The cover at its large tier, for the post's structured data. */
export function blogPostImage(meta: BlogPostMeta): string {
  return resolveAsset(meta.cover.key, 'large');
}
