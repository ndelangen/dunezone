import { v } from 'convex/values';

import { publicQuery } from './functions';
import { assetDisplayName } from './lib/assetInput';
import { rulesetDeck } from './lib/rulesetSlots';

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
    /* Every ruleset's slot and asset are read together rather than one ruleset after another. */
    const decks = await Promise.all(rulesets.map((ruleset) => rulesetDeck(ctx, ruleset._id, 'spice')));
    return rulesets.flatMap((ruleset, index) => {
      const deck = decks[index];
      return deck
        ? [
            {
              rulesetId: ruleset._id,
              ruleset: ruleset.name,
              deck: { type: deck.type, slug: deck.slug, name: assetDisplayName(deck) },
            },
          ]
        : [];
    });
  },
});
