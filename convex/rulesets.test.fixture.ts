/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';

import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

export const VALID_ABOUT = 'A house ruleset that rebalances spice income and shortens the endgame considerably.';

export function rulesetTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

/** One signed-in Ruleset owner on a fresh test world, the fixture every Ruleset seam test starts from. */
export async function rulesetOwner() {
  const t = rulesetTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ruleset owner' }));
  return { t, owner: t.withIdentity({ subject: ownerId }) };
}
