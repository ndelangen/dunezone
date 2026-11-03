import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TUTORIAL_PAGES } from '@shared/recordlessPublicPages';
import { expect, test } from 'vite-plus/test';

import { CREATOR_TUTORIALS } from '../create/creatorTutorials';
import { TUTORIAL_CHAPTERS } from './chapters';
import { CHAPTER_SCRIPTS } from './chapterScripts/scripts';

/*
 * The Worker serves the tutorial routes, but the sitemap lists only TUTORIAL_PAGES.
 * A built tutorial missing from that list would be served and never submitted, and a listed one not built would submit a dead page,
 * so the list is held to the chapter scripts, the creator tutorials and the generated route tree.
 */
test('the sitemap lists every built Play chapter', () => {
  const chapters = TUTORIAL_PAGES.filter((page) => page.startsWith('/tutorial/'));
  const built = TUTORIAL_CHAPTERS.filter((chapter) => chapter.slug in CHAPTER_SCRIPTS);
  expect(chapters).toEqual(built.map((chapter) => `/tutorial/${chapter.slug}`));
});

test('the sitemap lists exactly the routes under /create, and every creator tutorial with a page opens one of them', () => {
  const tree = readFileSync(fileURLToPath(new URL('../../../routeTree.gen.ts', import.meta.url)), 'utf8');
  const routes = [...new Set([...tree.matchAll(/'(\/create(?:\/[^'$]+?)?)\/?'/g)].map((match) => match[1]!))];
  const listed = TUTORIAL_PAGES.filter((page) => page === '/create' || page.startsWith('/create/'));
  expect(routes.sort()).toEqual([...listed].sort());
  for (const tutorial of CREATOR_TUTORIALS) {
    if (tutorial.page) {
      expect(listed).toContain(tutorial.page.to);
    }
  }
});

test('both catalogues are listed', () => {
  expect(TUTORIAL_PAGES).toEqual(expect.arrayContaining(['/tutorial', '/create']));
});
