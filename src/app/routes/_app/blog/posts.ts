import { formatStableDate } from '@ui/content/dates';
import type { ComponentType } from 'react';

import * as whyDune from './posts/why-dune';

/** What the post list, the page head and the sitemap know about a post without rendering it. */
export type BlogPostMeta = {
  /** The last segment of the post's address; it must also be listed in `BLOG_POST_SLUGS`. */
  slug: string;
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

type BlogPost = { meta: BlogPostMeta; default: ComponentType };

/**
 * Every published post, newest first.
 * Publishing a post is writing its file under `posts/`, adding it here, and adding its slug to `BLOG_POST_SLUGS`.
 */
export const BLOG_POSTS: readonly BlogPost[] = [whyDune];

export function findBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.meta.slug === slug);
}

/** The date and author line the post list and the post page both show above a title. */
export function blogPostByline(meta: BlogPostMeta): string {
  return `${formatStableDate(meta.date)} · ${meta.author}`;
}
