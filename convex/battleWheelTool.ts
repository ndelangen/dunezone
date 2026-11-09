import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { CanonicalFactionStoredObject, toStoredHeroKey } from '../src/shared/factions/schema';
import { battleWheelFactionSchema } from '../src/shared/play/capture';
import { battleDialingOf, battleDialingSchema } from '../src/shared/rulesets/battleDialing';
import { publicQuery } from './functions';
import { resolveBackgrounds } from './lib/backgroundPresets';

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

/*
 * A faction as the battle wheel reads it: its identity and its stored definition, with every linked background resolved to the
 * preset it uses now, so the wheel's tokens show the faction's current artwork.
 * Null when the faction is gone.
 */
export const faction = publicQuery({
  args: { factionId: v.string() },
  returns: v.union(v.null(), zodToConvex(battleWheelFactionSchema)),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('factions', args.factionId);
    const row = id ? await ctx.db.get('factions', id) : null;
    if (!row || row.is_deleted) {
      return null;
    }
    const parsed = CanonicalFactionStoredObject.safeParse(row.data);
    return {
      faction: { id: row._id, slug: row.slug, name: parsed.success ? parsed.data.name : '' },
      data: parsed.success ? toStoredHeroKey(await resolveBackgrounds(ctx, parsed.data)) : null,
    };
  },
});
