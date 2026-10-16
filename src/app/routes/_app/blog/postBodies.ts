import type { BlogPostSlug } from '@shared/blogPostSlugs';
import type { ComponentType } from 'react';

import AllInOneDuneBoardGameWebapp from './posts/all-in-one-dune-board-game-webapp';
import BuildingADuneSandbox from './posts/building-a-dune-sandbox';
import TabletopSimulator from './posts/tabletop-simulator';
import WhyDune from './posts/why-dune';

/**
 * Each post's body, by slug.
 * Only the post page's component imports this, so the bodies and the renderers they embed stay in that page's split chunk.
 */
export const BLOG_POST_BODIES: Record<BlogPostSlug, ComponentType> = {
  'all-in-one-dune-board-game-webapp': AllInOneDuneBoardGameWebapp,
  'building-a-dune-sandbox': BuildingADuneSandbox,
  'tabletop-simulator': TabletopSimulator,
  'why-dune': WhyDune,
};
