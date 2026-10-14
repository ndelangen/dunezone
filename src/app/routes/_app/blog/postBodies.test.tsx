/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { appContentTheme } from '@ui/theme';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import { BLOG_POST_BODIES } from './postBodies';
import { BLOG_POSTS } from './posts';

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

/* Every post closes on a picture, so nothing a reader reads comes after its last figure. */
test.each(BLOG_POSTS.map(({ slug }) => slug))('the post %s ends with a picture', (slug) => {
  const Body = BLOG_POST_BODIES[slug];
  const markup = renderToStaticMarkup(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <Body />
    </MantineProvider>
  );
  const body = new DOMParser().parseFromString(markup, 'text/html').body;

  const lastFigure = [...body.querySelectorAll('figure')].at(-1);
  expect(lastFigure, 'the post has no figure').toBeDefined();
  const textAfter = [...body.querySelectorAll(READING_TEXT)].filter(
    (element) => lastFigure!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(textAfter.map((element) => element.textContent)).toEqual([]);
});
