import { FAQ_PREVIEW_SIZE } from '../../src/shared/faq/catalogueSearch';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { ownPublishedFace } from './assetBacks';
import { countCataloguePartitions } from './catalogueOrder';
import { assignedGroupSummary } from './collaborativeAccess';
import { catalogueFactionFromCard, toCatalogueFaction } from './factionCatalogue';
import { faqAnsweredPartition, faqRulesetPartition } from './faqCatalogue';
import { loadNewestFaqItems } from './faqRulesetList';

/* What `faqItems` carried before the FAQ had its own page, kept for browsers still on that bundle; the next release drops it. */
const LEGACY_FAQ_LIST_LIMIT = 200;
import { profileSummary } from './profileSummary';
import { listRulesetRulebooks } from './rulebookList';
import { readRulesetAssetSlots } from './rulesetSlots';

export const RULESET_FACTION_LIMIT = 500;
/** Factions the ruleset page shows; "All N factions" opens the catalogue filtered to the ruleset for the rest. */
export const RULESET_FACTION_PREVIEW_SIZE = 3;

/** A non-deleted ruleset resolved by its public slug, or null. The one soft-delete gate. */
export async function loadPublicRulesetBySlug(ctx: QueryCtx, slug: string) {
  const row = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) {
    return null;
  }
  return row;
}

/**
 * The linked factions, in the same shape the catalogue puts on the wire, so a ruleset's page can render them with the same vocabulary.
 * Stored data is parsed the way the catalogue parses it: an unreadable row throws rather than degrading, because the app already bets everywhere else that faction data parses.
 * Soft-deleted and dangling links are dropped.
 *
 * `rulesets` is deliberately empty: these factions are already being read *inside* one ruleset, so captioning each card with a ruleset name would repeat the page's own subject back at the reader.
 * Callers that need the full list have the catalogue for it.
 */
async function listPublicRulesetFactions(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset', (q) => q.eq('ruleset_id', rulesetId))
    .take(RULESET_FACTION_LIMIT);
  const factions = await Promise.all(links.map((link) => linkedCatalogueFaction(ctx, link.faction_id)));
  return factions.filter((faction) => faction !== null);
}

/* A linked faction read from its card; the faction itself is read only when the card is missing, as for a link the card backfill has not reached. */
async function linkedCatalogueFaction(ctx: QueryCtx, factionId: Id<'factions'>) {
  const card = await ctx.db
    .query('faction_cards')
    .withIndex('by_faction', (q) => q.eq('faction_id', factionId))
    .unique();
  if (card) {
    return card.is_deleted ? null : await catalogueFactionFromCard(ctx, card, []);
  }
  const faction = await ctx.db.get('factions', factionId);
  return faction && !faction.is_deleted ? toCatalogueFaction(faction, []) : null;
}

/**
 * A ruleset's live factions in its own order, each with its name, address and token but not its card: behind `api.rulesets.orderedFactions`.
 * Each is read from its card, or from the faction where the card backfill has not reached it;
 * soft-deleted and dangling links are dropped.
 */
export async function listOrderedRulesetFactions(ctx: QueryCtx, rulesetId: Id<'rulesets'>, limit: number) {
  const bounded = Math.min(Math.max(1, Math.floor(limit)), RULESET_FACTION_LIMIT);
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId))
    .take(bounded + 1);
  const factions = await Promise.all(
    links.slice(0, bounded).map((link) => linkedCatalogueFaction(ctx, link.faction_id))
  );
  return {
    factions: factions
      .filter((faction) => faction !== null)
      .map((faction) => ({
        _id: faction._id,
        slug: faction.slug,
        name: faction.data.name,
        logo: faction.data.logo,
        background: faction.data.background,
      })),
    /* Never past the limit, which `addFaction` holds rulesets to, so Load more cannot stall on the same page. */
    hasMore: links.length > bounded && bounded < RULESET_FACTION_LIMIT,
  };
}

/** The ruleset and its factions, the same for every viewer: behind `api.rulesets.page`. Throws for an unknown slug. */
export async function loadRulesetPageBySlug(ctx: QueryCtx, slug: string) {
  const row = await loadPublicRulesetBySlug(ctx, slug);
  if (!row) {
    throw new Error(`Ruleset with slug ${slug} not found`);
  }
  return { ruleset: row, factions: await listPublicRulesetFactions(ctx, row._id) };
}

/**
 * The slotted board as the detail page draws it: its slot entry plus its face, addressed the way the board's own page addresses it.
 * Null when the slot is empty, which the page draws as a placeholder.
 */
function rulesetBoardFace(slots: Awaited<ReturnType<typeof readRulesetAssetSlots>>) {
  const entry = slots.find((slot) => slot.slot === 'board');
  return entry ? { ...entry.asset, previewHref: ownPublishedFace(entry.doc) } : null;
}

/**
 * The ruleset's first factions in its own order, and how many live ones it has from the faction catalogue's list for it, so the page reads a few cards whatever the ruleset's size.
 * Soft-deleted and dangling links are skipped.
 */
async function rulesetFactionPreview(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const [factionPreview, [factionCount = 0]] = await Promise.all([
    firstLiveRulesetFactions(ctx, rulesetId),
    countCataloguePartitions(ctx, 'faction', [rulesetId]),
  ]);
  return { factionPreview, factionCount };
}

/* Walks the links in order until the preview is full, so any number of soft-deleted factions near the top still leave it full; a ruleset holds at most `RULESET_FACTION_LIMIT` links. */
async function firstLiveRulesetFactions(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const preview: NonNullable<Awaited<ReturnType<typeof linkedCatalogueFaction>>>[] = [];
  const links = ctx.db.query('ruleset_factions').withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId));
  let read = 0;
  for await (const link of links) {
    read += 1;
    const faction = await linkedCatalogueFaction(ctx, link.faction_id);
    if (faction) {
      preview.push(faction);
    }
    if (preview.length === RULESET_FACTION_PREVIEW_SIZE || read === RULESET_FACTION_LIMIT) {
      break;
    }
  }
  return preview;
}

/** How many questions a ruleset has, and how many of them have an accepted answer, from its FAQ lists' counts. */
async function rulesetFaqCounts(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const [questions = 0, answered = 0] = await countCataloguePartitions(ctx, 'faq', [
    faqRulesetPartition(rulesetId),
    faqAnsweredPartition(rulesetId),
  ]);
  return { questions, answered };
}

/** The ruleset detail page, the same for every viewer: behind `api.rulesets.detailPage`. Null for an unknown slug. */
export async function loadRulesetPublicDetailPageBySlug(ctx: QueryCtx, slug: string) {
  const row = await loadPublicRulesetBySlug(ctx, slug);
  if (!row) {
    return null;
  }
  const slots = await readRulesetAssetSlots(ctx, row._id);
  return {
    ruleset: row,
    /* Every linked faction, for browsers from before the rail showed a few; this bundle reads `factionPreview`, and the next release drops it. */
    factions: await listPublicRulesetFactions(ctx, row._id),
    ...(await rulesetFactionPreview(ctx, row._id)),
    assignedGroup: await assignedGroupSummary(ctx, row.group_id),
    faqItems: await loadNewestFaqItems(ctx, row._id, LEGACY_FAQ_LIST_LIMIT),
    faqPreview: await loadNewestFaqItems(ctx, row._id, FAQ_PREVIEW_SIZE),
    faqCounts: await rulesetFaqCounts(ctx, row._id),
    owner: await profileSummary(ctx, row.owner_id),
    assetSlots: slots.map(({ slot, asset }) => ({ slot, asset })),
    board: rulesetBoardFace(slots),
    rulebooks: await listRulesetRulebooks(ctx, row._id),
  };
}
