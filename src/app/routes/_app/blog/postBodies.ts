import type { BlogPostSlug } from '@shared/blogPostSlugs';
import { lazy } from 'react';
import type { ComponentType } from 'react';

type BodyModule = { default: ComponentType };

/**
 * Each post's body, by slug, as a dynamic import.
 * Every post becomes its own chunk together with the figures and renderers it embeds, so a reader downloads one post's infographics only on that post's page.
 * A post's own components live next to it (as in `posts/<slug>/`) and are imported only from its body file, never from here.
 */
export const BLOG_POST_BODIES: Record<BlogPostSlug, () => Promise<BodyModule>> = {
  'all-in-one-dune-board-game-webapp': () => import('./posts/all-in-one-dune-board-game-webapp'),
  'tabletop-simulator': () => import('./posts/tabletop-simulator'),
  'why-dune': () => import('./posts/why-dune'),
};

const loaded = new Map<BlogPostSlug, ComponentType>();
const lazyBodies = new Map<BlogPostSlug, ComponentType>();

/**
 * Downloads a post's chunk and keeps its body, so the page draws it at once instead of suspending.
 * The route's loader awaits this, which renders the post in full on the server and on in-app navigation.
 */
export async function preloadBlogPostBody(slug: BlogPostSlug): Promise<void> {
  if (!loaded.has(slug)) {
    loaded.set(slug, (await BLOG_POST_BODIES[slug]()).default);
  }
}

/**
 * The post's body: the loaded one when `preloadBlogPostBody` has run, otherwise a lazy one.
 * The lazy body only shows while the page hydrates, where its `Suspense` keeps the server's markup until the chunk arrives.
 */
export function blogPostBody(slug: BlogPostSlug): ComponentType {
  /* Once a post went lazy it stays lazy, so a later render never swaps its component and remounts its figures. */
  const lazyBody = lazyBodies.get(slug);
  if (lazyBody) {
    return lazyBody;
  }
  const body = loaded.get(slug);
  if (body) {
    return body;
  }
  const created = lazy(BLOG_POST_BODIES[slug]);
  lazyBodies.set(slug, created);
  return created;
}
