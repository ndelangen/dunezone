import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { DECK_CARD, membersOf } from './assets';
import { publicQuery } from './functions';
import { resolveBackHref } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import type { CardbackPresetMemo } from './lib/cardbackPresets';

/* Far more Treachery cards than the catalogue holds; one card row and its deck memberships each keeps the answer inside a query's reads. */
const CARD_LIMIT = 2000;
/* A card is in a handful of decks at most. */
const DECKS_PER_CARD = 20;
/* A Ruleset for trying things out, never named to a table. */
const HIDDEN_RULESETS = new Set(['test']);

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

/* Every live deck holding a live Treachery card: found from the cards, so a deck that mixes card types is found whatever its first card is. */
async function decksWithTreachery(ctx: QueryCtx) {
  const cards = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', 'card-treachery').eq('is_deleted', false))
    .take(CARD_LIMIT);
  const memberships = await Promise.all(
    cards.map((card) =>
      ctx.db
        .query('asset_relations')
        .withIndex('by_to_kind', (q) => q.eq('to_asset_id', card._id).eq('kind', DECK_CARD))
        .take(DECKS_PER_CARD)
    )
  );
  const ids = [...new Set(memberships.flat().map((membership) => membership.from_asset_id))];
  const decks = await Promise.all(ids.map((id) => ctx.db.get('assets', id)));
  return decks.filter((deck): deck is Doc<'assets'> => deck !== null && !deck.is_deleted && deck.type === 'deck');
}

/* The deck's live Treachery copies, read as the capture reads its members, so the count matches the cards a game copies. */
async function copiesIn(ctx: QueryCtx, deck: Doc<'assets'>) {
  const { entries } = await membersOf(ctx, deck._id, DECK_CARD);
  return entries.reduce((total, entry) => total + (entry.row.type === 'card-treachery' ? entry.count : 0), 0);
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
    ruleset && !ruleset.is_deleted && !HIDDEN_RULESETS.has(ruleset.slug)
      ? [{ slug: ruleset.slug, name: ruleset.name }]
      : []
  );
}

/**
 * Every live deck with live Treachery cards, which the standalone Treachery tracker lets a player pick any of, several at once.
 * Each names the Rulesets that slot it, so the tool can start from a Ruleset's deck and the player can tell decks of one name apart.
 * The tool reads the chosen decks' cards through the catalogue capture a game makes.
 */
export const decks = publicQuery({
  args: {},
  returns: v.array(treacheryDeckChoiceValidator),
  handler: async (ctx) => {
    const rows = await decksWithTreachery(ctx);
    const presets: CardbackPresetMemo = new Map();
    const choices = await Promise.all(
      rows.map(async (row) => {
        const cards = await copiesIn(ctx, row);
        if (cards === 0) {
          return null;
        }
        const [back, rulesets] = await Promise.all([resolveBackHref(ctx, row, presets), treacheryRulesets(ctx, row)]);
        return { id: row._id, slug: row.slug, name: assetDisplayName(row), cards, back: back?.href ?? null, rulesets };
      })
    );
    /* A Ruleset's deck first, then by name, so the decks a game is played with lead the list. */
    return choices
      .filter((choice) => choice !== null)
      .sort((a, b) => Number(b.rulesets.length > 0) - Number(a.rulesets.length > 0) || a.name.localeCompare(b.name));
  },
});
