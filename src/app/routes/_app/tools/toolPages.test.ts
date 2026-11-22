import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TOOL_PAGES } from '@shared/recordlessPublicPages';
import { expect, test } from 'vite-plus/test';

import { FORMER_TOOL_SLUGS, toolAt, toolPath, TOOLS } from './tools';

/*
 * The sitemap lists only TOOL_PAGES below /tools, so a built tool missing from it would never be submitted,
 * and a listed one still on its placeholder would submit a noindex page.
 * The list is held to the registry's `built` flags, and each built tool to a static route of its own in the route tree.
 */
test('the sitemap lists exactly the built tools', () => {
  expect(TOOL_PAGES).toEqual(TOOLS.filter((tool) => tool.built).map(toolPath));
});

test('every built tool has its own route at its placeholder address', () => {
  const tree = readFileSync(fileURLToPath(new URL('../../../routeTree.gen.ts', import.meta.url)), 'utf8');
  for (const page of TOOL_PAGES) {
    expect(tree).toContain(`'${page}'`);
  }
});

test('every tool has a unique slug', () => {
  expect(new Set(TOOLS.map((tool) => tool.slug)).size).toBe(TOOLS.length);
});

test('a former slug names a tool that exists, and no tool still has it', () => {
  for (const [former, current] of Object.entries(FORMER_TOOL_SLUGS)) {
    expect(toolAt(current), former).toBeDefined();
    expect(toolAt(former), former).toBeUndefined();
  }
});
