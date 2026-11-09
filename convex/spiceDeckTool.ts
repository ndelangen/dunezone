import { v } from 'convex/values';

import { publicQuery } from './functions';
import { assetDisplayName } from './lib/assetInput';

/* Far more rulesets than the catalogue holds; one slot row and one asset row each keeps the answer inside a query's reads. */
const RULESET_LIMIT = 200;

const spiceDeckChoiceValidator = v.object({
  rulesetId: v.id('rulesets'),
  ruleset: v.string(),
  deck: v.object({ type: v.string(), slug: v.string(), name: v.string() }),
});

/**
 * The spice decks the spice deck tool offers: every live ruleset that slots one, by ruleset name.
 * The tool reads the chosen deck's cards through `playCatalogue.assetSupply`, the answer a game reads when it captures the deck.
 */
export const decks = publicQuery({
  args: {},
  returns: v.array(spiceDeckChoiceValidator),
  handler: async (ctx) => {
    const rulesets = await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(RULESET_LIMIT);
    const choices = [];
    for (const ruleset of rulesets) {
      const slot = await ctx.db
        .query('ruleset_asset_slots')
        .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ruleset._id).eq('slot', 'spice'))
        .first();
      const deck = slot ? await ctx.db.get('assets', slot.asset_id) : null;
      if (deck && !deck.is_deleted) {
        choices.push({
          rulesetId: ruleset._id,
          ruleset: ruleset.name,
          deck: { type: deck.type, slug: deck.slug, name: assetDisplayName(deck) },
        });
      }
    }
    return choices;
  },
});
