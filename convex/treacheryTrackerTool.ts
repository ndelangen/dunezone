import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { DECK_CARD } from './assets';
import { publicQuery } from './functions';
import { resolveBackHref } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import type { CardbackPresetMemo } from './lib/cardbackPresets';

/* Far more decks than the catalogue holds; a few rows each keeps the answer inside a query's reads. */
const DECK_LIMIT = 300;
/* Copies are counted from the membership rows alone, up to a deck far larger than any Treachery deck. */
const COUNTED_MEMBERS = 200;

const treacheryDeckChoiceValidator = v.object({
  id: v.id('assets'),
  slug: v.string(),
  name: v.string(),
  /** Copies in the deck, counted from its membership rows. */
  cards: v.number(),
  /** The deck's published back, or null while it has none. */
  back: v.union(v.string(), v.null()),
  /** The live Rulesets that slot it as their Treachery deck, by slug and name. */
  rulesets: v.array(v.object({ slug: v.string(), name: v.string() })),
});

/* Whether the deck holds Treachery cards: its first member is one, as a deck holds one type of card. */
async function holdsTreachery(ctx: QueryCtx, deck: Doc<'assets'>) {
  const first = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck._id).eq('kind', DECK_CARD))
    .first();
  const card = first ? await ctx.db.get('assets', first.to_asset_id) : null;
  return card?.type === 'card-treachery';
}

async function copiesIn(ctx: QueryCtx, deck: Doc<'assets'>) {
  const members = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck._id).eq('kind', DECK_CARD))
    .take(COUNTED_MEMBERS);
  return members.reduce((total, member) => total + member.count, 0);
}

async function treacheryRulesets(ctx: QueryCtx, deck: Doc<'assets'>) {
  const slots = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_asset', (q) => q.eq('asset_id', deck._id))
    .take(50);
  const rulesets = await Promise.all(
    slots.filter((slot) => slot.slot === 'treachery').map((slot) => ctx.db.get('rulesets', slot.ruleset_id))
  );
  return rulesets.flatMap((ruleset) =>
    ruleset && !ruleset.is_deleted ? [{ slug: ruleset.slug, name: ruleset.name }] : []
  );
}

/**
 * Every live deck of Treachery cards, which the standalone Treachery tracker lets a player pick any of, several at once.
 * Each names the Rulesets that slot it, so the tool can start from a Ruleset's deck and the player can tell decks of one name apart.
 * The tool reads the chosen decks' cards through the catalogue capture a game makes.
 */
export const decks = publicQuery({
  args: {},
  returns: v.array(treacheryDeckChoiceValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', 'deck').eq('is_deleted', false))
      .take(DECK_LIMIT);
    const presets: CardbackPresetMemo = new Map();
    const choices = await Promise.all(
      rows.map(async (row) => {
        if (!(await holdsTreachery(ctx, row))) {
          return null;
        }
        const [cards, back, rulesets] = await Promise.all([
          copiesIn(ctx, row),
          resolveBackHref(ctx, row, presets),
          treacheryRulesets(ctx, row),
        ]);
        return { id: row._id, slug: row.slug, name: assetDisplayName(row), cards, back: back?.href ?? null, rulesets };
      })
    );
    /* A Ruleset's deck first, then by name, so the decks a game is played with lead the list. */
    return choices
      .filter((choice) => choice !== null)
      .sort((a, b) => Number(b.rulesets.length > 0) - Number(a.rulesets.length > 0) || a.name.localeCompare(b.name));
  },
});
