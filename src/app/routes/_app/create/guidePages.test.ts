import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CREATE_GUIDE_PAGES } from '@shared/recordlessPublicPages';
import { expect, test } from 'vite-plus/test';

/*
 * The Worker serves every path under /create, but the sitemap lists only CREATE_GUIDE_PAGES.
 * A guide route missing from that list would be served and never submitted, so the list is held to the generated route tree.
 */
test('the sitemap lists exactly the guide routes under /create', () => {
  const tree = readFileSync(fileURLToPath(new URL('../../../routeTree.gen.ts', import.meta.url)), 'utf8');
  const guides = [...new Set([...tree.matchAll(/'(\/create\/[^'$]+?)\/?'/g)].map((match) => match[1]!))];
  expect(guides.sort()).toEqual([...CREATE_GUIDE_PAGES].sort());
});
