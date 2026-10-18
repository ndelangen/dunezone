import type { BlogPostSlug } from '@shared/blogPostSlugs';
import { lazy } from 'react';
import type { ComponentType } from 'react';

type BodyModule = { default: ComponentType };

/**
 * Each post's body, by slug, as a dynamic import.
 * Every post becomes its own chunk together with the figures and renderers it embeds, so a reader downloads one post's infographics only on that post's page.
 * A post's own components live in a folder beside it (as `posts/assets/` does) and are imported only from its body file;
 * none of them is named `index.tsx` or `*.route.tsx`, which the router would read as a page.
 */
export const BLOG_POST_BODIES: Record<BlogPostSlug, () => Promise<BodyModule>> = {
  'all-in-one-dune-board-game-webapp': () => import('./posts/all-in-one-dune-board-game-webapp'),
  'dune-board-game-style-guide': () => import('./posts/dune-board-game-style-guide'),
  'drawing-dune-tokens-and-cards': () => import('./posts/drawing-dune-tokens-and-cards'),
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
  /* A lazy component keeps a failed import forever, so a failed chunk is forgotten and the next visit tries again. */
  const created = lazy(() =>
    BLOG_POST_BODIES[slug]().catch((error: unknown) => {
      lazyBodies.delete(slug);
      throw error;
    })
  );
  lazyBodies.set(slug, created);
  return created;
}
