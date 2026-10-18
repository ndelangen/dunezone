/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type { AssetSize } from '@shared/assetRules';
import type { BlogPostSlug } from '@shared/blogPostSlugs';
import { MEDIA_MAP } from '@shared/media/map.generated';
import type * as ResolveAsset from '@shared/media/resolveAsset';
import type * as TanStackRouter from '@tanstack/react-router';
import { appContentTheme } from '@ui/theme';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, test, vi } from 'vite-plus/test';

import { BLOG_POST_BODIES } from './postBodies';
import { BLOG_POSTS } from './posts';

/* Every asset key a post resolves while it renders, including images `PublishedImage` only draws once the browser runs. */
const resolvedKeys = new Set<string>();
vi.mock('@shared/media/resolveAsset', async (importOriginal) => {
  const actual = await importOriginal<typeof ResolveAsset>();
  return {
    ...actual,
    resolveAsset: (key: string, size: AssetSize) => {
      resolvedKeys.add(key);
      return actual.resolveAsset(key, size);
    },
  };
});

/* A post's in-site links need no router to be drawn as markup. */
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof TanStackRouter>()),
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

/* Text a reader would take as part of the post: a figure's own caption is not among it. */
const READING_TEXT = 'p:not(figure p), h1, h2, h3, h4, h5, h6, li, blockquote';

async function renderBody(slug: BlogPostSlug): Promise<HTMLElement> {
  const { default: Body } = await BLOG_POST_BODIES[slug]();
  const markup = renderToStaticMarkup(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <Body />
    </MantineProvider>
  );
  return new DOMParser().parseFromString(markup, 'text/html').body;
}

/* Loading a post's chunk the first time takes longer than one test's timeout for posts that embed the renderers, so every chunk loads once up front. */
beforeAll(async () => {
  await Promise.all(Object.values(BLOG_POST_BODIES).map((load) => load()));
}, 60_000);

/* Every post closes on a picture, so nothing a reader reads comes after its last figure. */
test.each(BLOG_POSTS.map(({ slug }) => slug))('the post %s ends with a picture', async (slug) => {
  const body = await renderBody(slug);

  const lastFigure = [...body.querySelectorAll('figure')].at(-1);
  expect(lastFigure, 'the post has no figure').toBeDefined();
  const textAfter = [...body.querySelectorAll(READING_TEXT)].filter(
    (element) => lastFigure!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(textAfter.map((element) => element.textContent)).toEqual([]);
});

/*
 * The dev server previews an image that is not synced yet from its legacy path, so a post can be drafted before its art is uploaded.
 * Nothing serves that path on the live site, so a post ships only once every image it shows resolves to its synced `/m/` variant.
 */
test.each(BLOG_POSTS.map(({ slug }) => slug))('every image in the post %s is synced', async (slug) => {
  resolvedKeys.clear();
  await renderBody(slug);
  const rasters = [...resolvedKeys].filter((key) => /\.(png|jpe?g)$/i.test(key));
  expect(rasters.length, 'the post shows no images').toBeGreaterThan(0);
  expect(
    rasters.filter((key) => !MEDIA_MAP[key]),
    'run `bun run media:sync` to upload these images'
  ).toEqual([]);
});
