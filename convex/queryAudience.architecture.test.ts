import { describe, expect, test } from 'vitest';

import { QUERY_AUDIENCE } from './functions';
import type { QueryAudience } from './functions';

/**
 * Every client-callable query declares who its answer is for.
 * `publicQuery` is the default: the same answer for every caller, so Convex caches one result for all of them.
 * A query lands here only when its answer genuinely depends on who asks, and the reason says why.
 * Adding a line to either list is a reviewed decision, never a way to make a failing test pass.
 */
const VIEWER_QUERIES: Record<string, string> = {
  'accountDeletion:page': "The viewer's own account deletion state.",
  'accountDeletion:listReplacementProfiles': 'Excludes the viewer from the replacement-owner search.',
  'accounts:connection': "Resolves a connection intent against the viewer's session.",
  'factions:listForLoadPicker': "The viewer's own and their Groups' factions.",
  'factions:listOwnedForGroupAssign': "The viewer's own factions.",
  'faq:viewerAnswered': "Whether the viewer answered one question: the viewer half of the question page's answer form.",
  'groups:viewerAssignableGroups': 'The Groups the viewer can move a subject into.',
  'groups:viewerMembership': "The viewer's membership of one Group: the viewer half of a page's capabilities.",
  'playDirectory:listGames': 'Marks the games the viewer is seated in.',
  'playGames:creatable': 'Rulesets the viewer may start a game with.',
  'playGames:getGame': "Gated on the viewer's seat.",
  'playGames:getGameByAddress': "Gated on the viewer's seat.",
  'playGames:nameAvailability': 'Rate-limited per viewer.',
  'profiles:defaultGroupPreference': "The viewer's own preference.",
  'profiles:session': 'Who the viewer is: their user id, profile and admin flag.',
  'profiles:settings': "The viewer's own settings and sign-in methods.",
  'rulebooks:creationPage': 'Only editors of the ruleset may create a rulebook.',
  'rulebooks:editorBySlugs': 'Drafts are visible to editors only.',
  'rulebooks:editorPage': 'Drafts are visible to editors only.',
  'rulesets:listOwnedForGroupAssign': "The viewer's own rulesets.",
};

/**
 * Public pages that still compute the viewer's capabilities on the server.
 * Each moves to `publicQuery` by returning the facts and letting the browser combine them with the viewer, as `factions:pageBySlug` does.
 * This list only shrinks.
 */
const PENDING_VIEWER_SPLIT: Record<string, string> = {
  'migrations:adminDashboard': 'reports access state; becomes adminQuery once the page gates on session.isAdmin',
  'publicationAdmin:page': 'reports access state; becomes adminQuery once the page gates on session.isAdmin',
};

/** Queries a library registers for us, so they cannot carry a builder mark. They read the viewer by design. */
const LIBRARY_QUERIES: Record<string, string> = {
  'auth:isAuthenticated': 'Exported by @convex-dev/auth from convexAuth().',
};

type RegisteredQuery = { isQuery?: boolean; isPublic?: boolean; [QUERY_AUDIENCE]?: QueryAudience };

const modules = import.meta.glob<Record<string, unknown>>(
  [
    './**/*.ts',
    '!./_generated/**',
    '!./**/*.test.ts',
    '!./**/*.d.ts',
    '!./**/*.fixture.ts',
    '!./convex.config.ts',
    '!./schema.ts',
    '!./auth.config.ts',
    '!./crons.ts',
    '!./http.ts',
  ],
  {
    eager: true,
  }
);

function clientQueries() {
  const queries = new Map<string, QueryAudience | undefined>();
  for (const [path, exports] of Object.entries(modules)) {
    const moduleName = path.replace(/^\.\//, '').replace(/\.ts$/, '');
    for (const [exportName, value] of Object.entries(exports)) {
      if (typeof value !== 'function') {
        continue;
      }
      const registered = value as unknown as RegisteredQuery;
      if (registered.isQuery && registered.isPublic) {
        queries.set(`${moduleName}:${exportName}`, registered[QUERY_AUDIENCE]);
      }
    }
  }
  return queries;
}

describe('query audience', () => {
  const queries = clientQueries();

  test('the registry was found', () => {
    expect(queries.size).toBeGreaterThan(50);
  });

  test('every client-callable query is built with publicQuery, viewerQuery or adminQuery', () => {
    const unmarked = [...queries]
      .filter(([name, audience]) => audience === undefined && !(name in LIBRARY_QUERIES))
      .map(([name]) => name);
    expect(unmarked).toEqual([]);
  });

  test('the pending split only shrinks', () => {
    /* Lower the cap as pages move to publicQuery or adminQuery; it never rises. */
    expect(Object.keys(PENDING_VIEWER_SPLIT).length).toBeLessThanOrEqual(2);
  });

  test('viewer queries are exactly the reviewed list', () => {
    const viewer = [...queries].filter(([, audience]) => audience === 'viewer').map(([name]) => name);
    expect(viewer.sort()).toEqual([...Object.keys(VIEWER_QUERIES), ...Object.keys(PENDING_VIEWER_SPLIT)].sort());
  });
});
