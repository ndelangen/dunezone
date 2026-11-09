import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { DECK_CARD, DECK_CARD_LIMIT } from './assets';
import { publicQuery } from './functions';
import { resolveBackHref } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import type { CardbackPresetMemo } from './lib/cardbackPresets';

/* Far more Treachery cards than the catalogue holds. */
const CARD_LIMIT = 1000;
/* Every deck a card was ever put in, deleted decks included, since deleting a deck keeps its rows; far more than any card is in. */
const DECKS_PER_CARD = 500;
/* At most this many reads in flight at once, well inside what one query may run together. */
const READS_AT_ONCE = 200;
/* Rulesets read to put their Treachery decks first; far more than the catalogue holds. */
const RULESET_LIMIT = 500;
/*
 * The rows one answer may read, well inside the 32,000 a query may read.
 * Past it the answer lists the decks counted so far, a Ruleset's deck first, rather than failing and listing none.
 */
const READ_BUDGET = 24_000;
/* At most this much of the budget goes to finding decks, so some is always left to count them. */
const FIND_BUDGET = 10_000;
/* The most a deck's Rulesets and back read besides its cards. */
const READS_PER_DECK = 60;
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

/* The rows this answer may still read. */
type Budget = { left: number };

/* Each item read in turn of batches, so a large catalogue never has more than READS_AT_ONCE reads in flight. */
async function inBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += READS_AT_ONCE) {
    results.push(...(await Promise.all(items.slice(start, start + READS_AT_ONCE).map(read))));
  }
  return results;
}

/* The decks the live Rulesets slot as their Treachery deck, so they are counted first and never left out. */
async function rulesetDecks(ctx: QueryCtx, budget: Budget) {
  const rulesets = (await ctx.db.query('rulesets').take(RULESET_LIMIT)).filter((ruleset) => !ruleset.is_deleted);
  budget.left -= rulesets.length;
  const slots = await inBatches(rulesets, (ruleset) =>
    ctx.db
      .query('ruleset_asset_slots')
      .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ruleset._id).eq('slot', 'treachery'))
      .take(10)
  );
  budget.left -= slots.flat().length;
  return slots.flat().map((slot) => slot.asset_id);
}

/* One card's membership reading so far: how many rows, and the last one's time, to read on from. */
type Reading = Readonly<{ card: Doc<'assets'>; read: number; after: number | undefined }>;

/* The rows of one round, at most `each` a card, and the cards cut short, to read on in the next round. */
async function readRound(ctx: QueryCtx, pending: readonly Reading[], each: number) {
  const slices = await inBatches(pending, ({ card, read, after }) =>
    ctx.db
      .query('asset_relations')
      .withIndex('by_to_kind', (q) => {
        const rows = q.eq('to_asset_id', card._id).eq('kind', DECK_CARD);
        return after === undefined ? rows : rows.gt('_creationTime', after);
      })
      .take(Math.min(each, DECKS_PER_CARD - read))
  );
  const next = pending.flatMap((reading, index): Reading[] => {
    const slice = slices[index];
    const read = reading.read + slice.length;
    const cutShort = slice.length === Math.min(each, DECKS_PER_CARD - reading.read) && read < DECKS_PER_CARD;
    return cutShort ? [{ card: reading.card, read, after: slice.at(-1)?._creationTime }] : [];
  });
  return { rows: slices.flat(), next };
}

/*
 * The decks holding a live Treachery card: found from the cards, so a deck that mixes card types is found whatever its first card is.
 * Also hands back each card row read on the way, so counting a deck's copies does not read them again.
 * Reads no more than FIND_BUDGET rows; a catalogue past that finds the decks of its first cards.
 */
async function decksWithTreachery(ctx: QueryCtx, budget: Budget) {
  const cards = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', 'card-treachery').eq('is_deleted', false))
    .take(CARD_LIMIT);
  budget.left -= cards.length;
  const known = new Map<Id<'assets'>, Doc<'assets'> | null>(cards.map((card) => [card._id, card]));
  const found: Id<'assets'>[] = [];
  let findLeft = Math.min(FIND_BUDGET, budget.left);
  let pending: Reading[] = cards.map((card) => ({ card, read: 0, after: undefined }));
  /* Rounds, each sharing what is left among the cards not read to the end, so a card cut short in one round is read on in the next. */
  for (let each = Math.floor(findLeft / pending.length); pending.length > 0 && each >= 1;) {
    const round = await readRound(ctx, pending, each);
    findLeft -= round.rows.length;
    budget.left -= round.rows.length;
    found.push(...round.rows.map((membership) => membership.from_asset_id));
    pending = round.next;
    each = pending.length > 0 ? Math.floor(findLeft / pending.length) : 0;
  }
  return { found, known };
}

/*
 * The deck's live copies of every card, by the rule the capture reads its members by (a deleted card adds none), so the count matches the cards the tracker copies.
 * A card already read, for this deck or another, is not read again.
 * Undefined when the budget runs out before the whole deck is counted.
 */
async function copiesIn(
  ctx: QueryCtx,
  deck: Doc<'assets'>,
  known: Map<Id<'assets'>, Doc<'assets'> | null>,
  budget: Budget
) {
  const most = Math.min(DECK_CARD_LIMIT, budget.left);
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck._id).eq('kind', DECK_CARD))
    .take(most + 1);
  budget.left -= relations.length;
  if (relations.length > most) {
    return undefined;
  }
  let total = 0;
  for (const relation of relations) {
    if (!known.has(relation.to_asset_id)) {
      if (budget.left < 1) {
        return undefined;
      }
      budget.left -= 1;
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

/* What counting one deck needs: the cards read so far, the reads left, and the cardback presets resolved so far. */
type Counting = Readonly<{
  known: Map<Id<'assets'>, Doc<'assets'> | null>;
  budget: Budget;
  presets: CardbackPresetMemo;
}>;

/* One deck as the list offers it; null when it is no live deck with cards, and 'out of reads' once the budget cannot count it whole. */
async function choiceFor(ctx: QueryCtx, id: Id<'assets'>, { known, budget, presets }: Counting) {
  if (budget.left < READS_PER_DECK) {
    return 'out of reads' as const;
  }
  budget.left -= READS_PER_DECK;
  const row = await ctx.db.get('assets', id);
  if (!isLiveDeck(row)) {
    return null;
  }
  const cards = await copiesIn(ctx, row, known, budget);
  if (cards === undefined) {
    return 'out of reads' as const;
  }
  /* A deck with no live card left in it has nothing to track. */
  if (cards === 0) {
    return null;
  }
  const [back, rulesets] = await Promise.all([resolveBackHref(ctx, row, presets), treacheryRulesets(ctx, row)]);
  return { id: row._id, slug: row.slug, name: assetDisplayName(row), cards, back: back?.href ?? null, rulesets };
}

function isLiveDeck(row: Doc<'assets'> | null): row is Doc<'assets'> {
  return row !== null && !row.is_deleted && row.type === 'deck';
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
    const budget: Budget = { left: READ_BUDGET };
    const slotted = await rulesetDecks(ctx, budget);
    const { found, known } = await decksWithTreachery(ctx, budget);
    const presets: CardbackPresetMemo = new Map();
    /* A deck at a time, a Ruleset's first, so a card two decks share is read once and the budget ends on whole decks. */
    const choices = [];
    for (const id of new Set([...slotted, ...found])) {
      const choice = await choiceFor(ctx, id, { known, budget, presets });
      if (choice === 'out of reads') {
        break;
      }
      if (choice) {
        choices.push(choice);
      }
    }
    /* A Ruleset's deck first, then by name, so the decks a game is played with lead the list. */
    return choices.sort(
      (a, b) => Number(b.rulesets.length > 0) - Number(a.rulesets.length > 0) || a.name.localeCompare(b.name)
    );
  },
});
