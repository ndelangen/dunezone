import type { BlogPostSlug } from '@shared/recordlessPublicPages';
import type { ComponentType } from 'react';

import WhyDune from './posts/why-dune';

/**
 * Each post's body, by slug.
 * Only the post page's component imports this, so the bodies and the renderers they embed stay in that page's split chunk.
 */
export const BLOG_POST_BODIES: Record<BlogPostSlug, ComponentType> = {
  'why-dune': WhyDune,
};
