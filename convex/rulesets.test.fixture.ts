/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { applicationTest } from './application.test.fixture';

export const VALID_ABOUT = 'A house ruleset that rebalances spice income and shortens the endgame considerably.';

export function rulesetTest() {
  return applicationTest();
}

/** One signed-in Ruleset owner on a fresh test world, the fixture every Ruleset seam test starts from. */
export async function rulesetOwner() {
  const t = rulesetTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ruleset owner' }));
  return { t, owner: t.withIdentity({ subject: ownerId }) };
}
