import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

import type { NavSegmentId } from './navigationSegments';
import { navSegmentFor } from './navigationSegments';

/**
 * Every route the app has, placed by hand in one of the two segments.
 * A new route fails this test until it is added here, so nobody adds an editor that the header files under Playing Dune by accident.
 */
const EXPECTED: Record<string, NavSegmentId> = {
  '/': 'play',
  '/$': 'play',
  '/__icons': 'play',
  '/__jobs': 'play',
  '/__media': 'play',
  '/_jobs': 'play',
  '/_admin/accounts': 'play',
  '/_admin/jobs': 'play',
  '/admin': 'play',
  '/admin/accounts': 'play',
  '/admin/game-debugger': 'play',
  '/admin/jobs': 'play',
  '/admin/migrations': 'play',
  '/admin/presets': 'play',
  '/imports': 'create',
  '/media': 'create',
  '/media/$source': 'create',
  '/media/$source/$kind': 'create',
  '/play': 'play',
  '/play/$gameId': 'play',
  '/play/create': 'play',
  '/tutorial': 'play',
  '/tutorial/$chapter': 'play',
  '/auth': 'play',
  '/auth/oauth': 'play',
  '/auth/error': 'play',
  '/auth/login': 'play',
  '/preview/sheet/$factionSlug': 'play',
  '/blog': 'play',
  '/blog/$postSlug': 'play',
  '/contributing': 'play',
  '/contributing/$intro': 'play',
  '/contributing/code': 'play',
  '/contributing/code/$lesson': 'play',
  '/contributing/deployment': 'play',
  '/contributing/deployment/$lesson': 'play',
  '/contributing/design-decisions': 'play',
  '/contributing/design-decisions/$group': 'play',
  '/contributing/glossary': 'play',
  '/contributing/glossary/$topic': 'play',
  '/create': 'create',
  '/create/faction': 'create',
  '/factions': 'play',
  '/factions/$factionId': 'play',
  '/factions/$factionId/edit': 'create',
  '/factions/create': 'create',
  '/faq': 'play',
  '/future-plans': 'play',
  '/glossary': 'play',
  '/privacy': 'play',
  '/groups/create': 'create',
  '/groups/$groupSlug': 'play',
  '/groups/$groupSlug/edit': 'create',
  '/profiles': 'play',
  '/profiles/$profileSlug': 'play',
  '/profiles/$profileSlug/connect': 'play',
  '/profiles/$profileSlug/delete': 'play',
  '/profiles/$profileSlug/edit': 'play',
  '/assets': 'play',
  '/assets/__presets': 'play',
  '/assets/$type': 'play',
  '/assets/$type/create': 'create',
  '/assets/$type/$slug': 'play',
  '/assets/$type/$slug/edit': 'create',
  '/assets/$type/$slug/convert-to-spice': 'create',
  '/rulesets': 'play',
  '/rulesets/create': 'create',
  '/rulesets/$rulesetSlug': 'play',
  '/rulesets/$rulesetSlug/edit': 'create',
  '/rulesets/$rulesetSlug/faq': 'play',
  '/rulesets/$rulesetSlug/faq/create': 'play',
  '/rulesets/$rulesetSlug/faq/$questionSlug': 'play',
  '/rulesets/$rulesetSlug/rulebooks/create': 'create',
  '/rulesets/$rulesetSlug/rulebooks/$rulebookSlug': 'play',
  '/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit': 'create',
  '/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/editions': 'create',
};

/* The generated tree is the one authority on which routes exist; its `fullPaths` union lists them all. */
function routePaths(): string[] {
  const tree = readFileSync(fileURLToPath(new URL('../routeTree.gen.ts', import.meta.url)), 'utf8');
  const union = tree.match(/\n {2}fullPaths:\n([\s\S]*?)\n {2}[a-zA-Z]/)?.[1] ?? '';
  return [...union.matchAll(/'([^']+)'/g)].map((match) => match[1]!.replace(/(.)\/$/, '$1'));
}

describe('navSegmentFor over the route tree', () => {
  const paths = routePaths();

  it('reads the route tree', () => {
    expect(paths.length).toBeGreaterThan(50);
  });

  it('has a placement for every route, and no placement for a route that is gone', () => {
    expect([...new Set(paths)].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('puts %s under %s', (path, segment) => {
    expect(navSegmentFor(path)).toBe(segment);
  });
});
