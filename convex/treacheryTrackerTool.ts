import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { DECK_CARD, DECK_CARD_LIMIT } from './assets';
import { publicQuery } from './functions';
import { resolveBackHref } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import type { CardbackPresetMemo } from './lib/cardbackPresets';

/* Far more Treachery cards than the catalogue holds, kept low enough that the whole answer stays inside one query's database calls. */
const CARD_LIMIT = 1000;
/* Every deck a card was ever put in, deleted decks included, since deleting a deck keeps its rows; far more than any card is in. */
const DECKS_PER_CARD = 500;
/* At most this many reads in flight at once, well inside what one query may run together. */
const READS_AT_ONCE = 200;
/* A Ruleset for trying things out, never named to a table. */
const HIDDEN_RULESETS = new Set(['test']);

const treacheryDeckChoiceValidator = v.object({
  id: v.id('assets'),
  slug: v.string(),
  name: v.string(),
  /** Live copies in the deck, of every card it holds, as the tracker copies them. */
  cards: v.number(),
  /** The deck's published back, or null while it has none. */
  back: v.union(v.string(), v.null()),
  /** The live Rulesets that slot it as their Treachery deck, by slug and name. */
  rulesets: v.array(v.object({ slug: v.string(), name: v.string() })),
});

/* Each item read in turn of batches, so a large catalogue never has more than READS_AT_ONCE reads in flight. */
async function inBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += READS_AT_ONCE) {
    results.push(...(await Promise.all(items.slice(start, start + READS_AT_ONCE).map(read))));
  }
  return results;
}

/*
 * Every live deck holding a live Treachery card: found from the cards, so a deck that mixes card types is found whatever its first card is.
 * Also hands back each card row read on the way, so counting a deck's copies does not read them again.
 */
async function decksWithTreachery(ctx: QueryCtx) {
  const cards = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', 'card-treachery').eq('is_deleted', false))
    .take(CARD_LIMIT);
  const known = new Map<Id<'assets'>, Doc<'assets'> | null>(cards.map((card) => [card._id, card]));
  const memberships = await inBatches(cards, (card) =>
    ctx.db
      .query('asset_relations')
      .withIndex('by_to_kind', (q) => q.eq('to_asset_id', card._id).eq('kind', DECK_CARD))
      .take(DECKS_PER_CARD)
  );
  const ids = [...new Set(memberships.flat().map((membership) => membership.from_asset_id))];
  const decks = await inBatches(ids, (id) => ctx.db.get('assets', id));
  return {
    decks: decks.filter((deck): deck is Doc<'assets'> => deck !== null && !deck.is_deleted && deck.type === 'deck'),
    known,
  };
}

/*
 * The deck's live copies of every card, by the rule the capture reads its members by (a deleted card adds none), so the count matches the cards the tracker copies.
 * A card already read, for this deck or another, is not read again.
 */
async function copiesIn(ctx: QueryCtx, deck: Doc<'assets'>, known: Map<Id<'assets'>, Doc<'assets'> | null>) {
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck._id).eq('kind', DECK_CARD))
    .take(DECK_CARD_LIMIT);
  let total = 0;
  for (const relation of relations) {
    if (!known.has(relation.to_asset_id)) {
      known.set(relation.to_asset_id, await ctx.db.get('assets', relation.to_asset_id));
    }
    const card = known.get(relation.to_asset_id);
    total += card && !card.is_deleted ? relation.count : 0;
  }
  return total;
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
    const { decks: rows, known } = await decksWithTreachery(ctx);
    const presets: CardbackPresetMemo = new Map();
    /* A deck at a time, so a card two decks share is read once and the reads stay few. */
    const choices = [];
    for (const row of rows) {
      const cards = await copiesIn(ctx, row, known);
      const [back, rulesets] = await Promise.all([resolveBackHref(ctx, row, presets), treacheryRulesets(ctx, row)]);
      choices.push({
        id: row._id,
        slug: row.slug,
        name: assetDisplayName(row),
        cards,
        back: back?.href ?? null,
        rulesets,
      });
    }
    /* A Ruleset's deck first, then by name, so the decks a game is played with lead the list. */
    return choices.sort(
      (a, b) => Number(b.rulesets.length > 0) - Number(a.rulesets.length > 0) || a.name.localeCompare(b.name)
    );
  },
});
