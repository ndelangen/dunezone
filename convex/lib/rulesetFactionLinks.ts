import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

/* The most factions one ruleset can link. */
export const RULESET_FACTION_LIMIT = 500;

/*
 * A ruleset's faction links in the order they were made, as these readers listed them before the maintainers' order existed.
 * Switching them to the maintainers' order is an open product question on #416, so the bounded read is sorted back here.
 */
export async function rulesetFactionLinksByCreation(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId))
    .take(RULESET_FACTION_LIMIT);
  return links.sort((a, b) => a._creationTime - b._creationTime);
}
