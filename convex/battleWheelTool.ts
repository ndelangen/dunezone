import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { battleDialingOf, battleDialingSchema } from '../src/shared/rulesets/battleDialing';
import { publicQuery } from './functions';

/* Far more rulesets than the catalogue holds, so the answer stays inside a query's reads. */
const RULESET_LIMIT = 200;

const battleWheelRulesetValidator = v.object({
  rulesetId: v.id('rulesets'),
  slug: v.string(),
  name: v.string(),
  dialing: zodToConvex(battleDialingSchema),
});

/**
 * The Rulesets the battle wheel tool counts with: every live ruleset by name, with its battle dialing.
 * A ruleset that has not chosen counts as Advanced, as every game does.
 */
export const rulesets = publicQuery({
  args: {},
  returns: v.array(battleWheelRulesetValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(RULESET_LIMIT);
    return rows.map((row) => ({
      rulesetId: row._id,
      slug: row.slug,
      name: row.name,
      dialing: battleDialingOf(row.battle_dialing),
    }));
  },
});
