import type { BlogPostSlug } from '@shared/recordlessPublicPages';
import type { ComponentType } from 'react';

import ABlogForDuneZone from './posts/a-blog-for-dune-zone';

/**
 * Each post's body, by slug.
 * Only the post page's component imports this, so the bodies and the renderers they embed stay in that page's split chunk.
 */
export const BLOG_POST_BODIES: Record<BlogPostSlug, ComponentType> = {
  'a-blog-for-dune-zone': ABlogForDuneZone,
};
