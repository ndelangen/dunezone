import type { Infer } from 'convex/values';

import { compareCodeUnits } from '../../src/shared/compareText';
import {
  FACTION_CATALOGUE_PAGE_SIZE,
  FACTION_CATALOGUE_QUERY_LIMIT,
  parseCataloguePage,
  parseComplexityRange,
} from '../../src/shared/factions/catalogueSearch';
import type { FactionCatalogueSearch, FactionCatalogueSort } from '../../src/shared/factions/catalogueSearch';
import { complexityOutOfTen, effectiveComplexity } from '../../src/shared/factions/complexity';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';
import { ALL_PARTITION, countCataloguePartitions, selectCataloguePage } from './catalogueOrder';
import type { CatalogueDirection, CatalogueSort } from './catalogueOrder';
import type { catalogueFactionValidator } from './collaborativeAccessValidators';
import { parseStoredFactionForRead } from './factionInput';

export type FactionRulesetSummary = {
  id: Id<'rulesets'>;
  slug: string;
  name: string;
};

/** Derived from the wire contract, so the projection below cannot quietly ship a field the validator rejects. */
export type CatalogueFaction = Infer<typeof catalogueFactionValidator>;

/**
 * The single narrowing site (#642): every catalogue-shaped surface builds its rows here.
 * Stored data is parsed in full first, because the parse is the read-time correctness check;
 * only what the surfaces draw survives onto the wire.
 * `faction_cards` stores this output, so a change to it, or to what the stored data must be to parse, bumps `FACTION_CARD_PROJECTION` below and ships a migration that rewrites the cards.
 */
export function toCatalogueFaction(row: Doc<'factions'>, rulesets: FactionRulesetSummary[]): CatalogueFaction {
  const { name, logo, background, factionLeader, leaders, complexity } = parseStoredFactionForRead(row.data);
  return {
    _id: row._id,
    slug: row.slug,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data: { name, logo, background, factionLeader, leaders, complexity },
    rulesets,
  };
}

/*
 * The version of `toCatalogueFaction`'s output that `faction_cards` stores.
 * Production never reruns a finished migration, so a change to that output leaves every existing card stale until its faction is saved again.
 * Such a change bumps this number and ships a new `faction_cards_v*` migration id that rewrites every card; until then a reader falls back to the faction for a card of another version.
 */
export const FACTION_CARD_PROJECTION = 1;

/**
 * The catalogue row a card stands for, read without the faction's authored blob.
 * A card from another projection version, or one whose faction did not parse when it was written, falls back to the faction itself, which is parsed afresh and throws as the catalogue always has.
 * A card of the current version is trusted as written, which is why a stricter parse also bumps the version.
 */
export async function catalogueFactionFromCard(
  ctx: QueryCtx,
  card: Doc<'faction_cards'>,
  rulesets: FactionRulesetSummary[]
): Promise<CatalogueFaction> {
  if (card.projection === FACTION_CARD_PROJECTION && card.data !== null) {
    return {
      _id: card.faction_id,
      slug: card.slug,
      created_at: card.created_at,
      updated_at: card.updated_at,
      data: card.data as CatalogueFaction['data'],
      rulesets,
    };
  }
  const faction = await ctx.db.get('factions', card.faction_id);
  if (!faction) {
    throw new Error(`Faction ${card.faction_id} missing for its card ${card._id}`);
  }
  return toCatalogueFaction(faction, rulesets);
}

const FACTION_LIMIT = 500;
/* Bounded whole-index scan of ruleset_factions for the catalogue path; one read replaces one
 * indexed read per faction. The bound mirrors the pre-existing per-faction take(500) caps. */
const FACTION_LINK_SCAN_LIMIT = 5000;

async function listActiveRulesetSummaries(ctx: QueryCtx): Promise<FactionRulesetSummary[]> {
  const rows = await ctx.db
    .query('rulesets')
    .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
    .take(500);

  return rows.map((row) => ({ id: row._id, slug: row.slug, name: row.name }));
}

/**
 * Faction catalogue read model: one call owns row selection, ruleset enrichment (active rulesets only, name-then-id order), and canonical faction parsing.
 * The catalogue path batches the link table in one bounded scan;
 * the owner path uses per-faction indexed reads, which win for the handful of factions one owner has.
 */
export async function loadFactionCatalogue(
  ctx: QueryCtx,
  options: { ownerId?: Id<'users'> } = {}
): Promise<{ factions: CatalogueFaction[]; rulesets: FactionRulesetSummary[] }> {
  const { ownerId } = options;
  const cards = ownerId
    ? await ctx.db
        .query('faction_cards')
        .withIndex('by_owner_deleted_created', (q) => q.eq('owner_id', ownerId).eq('is_deleted', false))
        .take(FACTION_LIMIT)
    : await ctx.db
        .query('faction_cards')
        .withIndex('by_deleted_created', (q) => q.eq('is_deleted', false))
        .take(FACTION_LIMIT);
  const rulesets = await listActiveRulesetSummaries(ctx);
  const factionIds = cards.map((card) => card.faction_id);
  const linksByFaction = ownerId ? await factionLinksByIndexedReads(ctx, factionIds) : await factionLinksByScan(ctx);
  const activeRulesetById = new Map(rulesets.map((ruleset) => [ruleset.id, ruleset]));

  const factions = await Promise.all(
    cards.map((card) =>
      catalogueFactionFromCard(
        ctx,
        card,
        (linksByFaction.get(card.faction_id) ?? [])
          .map((rulesetId) => activeRulesetById.get(rulesetId))
          .filter((ruleset): ruleset is FactionRulesetSummary => ruleset != null)
          .sort(compareRulesets)
      )
    )
  );

  return { factions, rulesets };
}

async function factionLinksByIndexedReads(ctx: QueryCtx, factionIds: Id<'factions'>[]) {
  const linksByFaction = new Map<Id<'factions'>, Id<'rulesets'>[]>();
  await Promise.all(
    factionIds.map(async (factionId) => {
      const links = await ctx.db
        .query('ruleset_factions')
        .withIndex('by_faction', (q) => q.eq('faction_id', factionId))
        .take(500);
      linksByFaction.set(
        factionId,
        links.map((link) => link.ruleset_id)
      );
    })
  );
  return linksByFaction;
}

async function factionLinksByScan(ctx: QueryCtx) {
  const links = await ctx.db.query('ruleset_factions').take(FACTION_LINK_SCAN_LIMIT);
  const linksByFaction = new Map<Id<'factions'>, Id<'rulesets'>[]>();
  for (const link of links) {
    const existing = linksByFaction.get(link.faction_id);
    if (existing) {
      existing.push(link.ruleset_id);
    } else {
      linksByFaction.set(link.faction_id, [link.ruleset_id]);
    }
  }
  return linksByFaction;
}

/** Homepage spotlights omit ruleset enrichment because they only render faction identity. */
export async function loadFactionCatalogueSpotlightPreviews(ctx: QueryCtx) {
  const cards = await ctx.db
    .query('faction_cards')
    .withIndex('by_deleted_created', (q) => q.eq('is_deleted', false))
    .take(FACTION_LIMIT);
  const selected = selectFactionCatalogueSpotlights(cards.map((card) => ({ ...card, _id: card.faction_id })));
  const preview = async (card: Doc<'faction_cards'> | undefined) => {
    if (!card) {
      return null;
    }
    const faction = await catalogueFactionFromCard(ctx, card, []);
    return {
      slug: faction.slug,
      created_at: faction.created_at,
      updated_at: faction.updated_at,
      data: {
        name: faction.data.name,
        logo: faction.data.logo,
        background: faction.data.background,
      },
    };
  };
  const cardOf = (selection: { faction_id: Id<'factions'> } | null) =>
    selection ? cards.find((card) => card.faction_id === selection.faction_id) : undefined;
  return {
    newArrival: await preview(cardOf(selected.newArrival)),
    freshlyUpdated: await preview(cardOf(selected.freshlyUpdated)),
  };
}

export function selectFactionCatalogueSpotlights<T extends Pick<Doc<'factions'>, '_id' | 'created_at' | 'updated_at'>>(
  factions: T[]
) {
  const newArrival = [...factions]
    .filter((faction) => parseTimestamp(faction.created_at) != null)
    .sort((left, right) => compareByDate(left, right, 'created_at'))[0];

  const freshlyUpdated = [...factions]
    .filter((faction) => {
      if (faction._id === newArrival?._id) {
        return false;
      }
      const createdAt = parseTimestamp(faction.created_at);
      const updatedAt = parseTimestamp(faction.updated_at);
      return createdAt != null && updatedAt != null && updatedAt > createdAt;
    })
    .sort((left, right) => compareByDate(left, right, 'updated_at'))[0];

  return {
    newArrival: newArrival ?? null,
    freshlyUpdated: freshlyUpdated ?? null,
  };
}

function compareRulesets(left: FactionRulesetSummary, right: FactionRulesetSummary) {
  return left.name.localeCompare(right.name) || String(left.id).localeCompare(String(right.id));
}

function compareByDate(
  left: Pick<Doc<'factions'>, '_id' | 'created_at' | 'updated_at'>,
  right: Pick<Doc<'factions'>, '_id' | 'created_at' | 'updated_at'>,
  field: 'created_at' | 'updated_at'
) {
  const leftTimestamp = parseTimestamp(left[field]);
  const rightTimestamp = parseTimestamp(right[field]);
  if (leftTimestamp == null && rightTimestamp == null) {
    return compareFactionIdentity(left, right);
  }
  if (leftTimestamp == null) {
    return 1;
  }
  if (rightTimestamp == null) {
    return -1;
  }
  return rightTimestamp - leftTimestamp || compareFactionIdentity(left, right);
}

function compareFactionIdentity(left: Pick<Doc<'factions'>, '_id'>, right: Pick<Doc<'factions'>, '_id'>) {
  return String(left._id).localeCompare(String(right._id));
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/* A faction's links are curated by hand; this bound is a ceiling on nonsense, the same one the detail page reads with. */
const FACTION_LINK_LIMIT = 500;

/**
 * What the catalogue searches and sorts on, read from the authored blob.
 * A blob the full read refuses still lists under its raw name, so a legacy row never fails the save that touched it.
 * The catalogue page that shows such a row fails loudly, as the unpaged catalogue did.
 */
function factionSearchFields(data: unknown) {
  try {
    const faction = parseStoredFactionForRead(data);
    return {
      name: faction.name,
      names: [faction.name, faction.factionLeader.name, ...faction.leaders.map((leader) => leader.name)],
      complexity: effectiveComplexity(faction.complexity),
    };
  } catch {
    const raw = (data ?? {}) as { name?: unknown };
    const name = typeof raw.name === 'string' ? raw.name : '';
    return { name, names: [name], complexity: 0 };
  }
}

/**
 * The faction kind of `catalogue_entries`: one entry per live faction, faceted by every ruleset it is linked to.
 * Which of those rulesets are live is resolved when the catalogue is read, so deleting a ruleset rewrites no entry.
 */
export const factionCatalogueKind: CatalogueKind = {
  sorts: ['name', 'created', 'updated', 'complexity'],
  expected: async (ctx, sourceId) => {
    const factionId = ctx.db.normalizeId('factions', sourceId);
    const faction = factionId ? await ctx.db.get('factions', factionId) : null;
    if (!faction || faction.is_deleted) {
      return null;
    }
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_faction', (q) => q.eq('faction_id', faction._id))
      .take(FACTION_LINK_LIMIT);
    if (links.length === FACTION_LINK_LIMIT) {
      console.warn(
        `Faction ${faction._id} has ${FACTION_LINK_LIMIT} or more ruleset links; the catalogue lists it under the first ${FACTION_LINK_LIMIT}.`
      );
    }
    const { name, names, complexity } = factionSearchFields(faction.data);
    return {
      kind: 'faction',
      source_id: faction._id,
      slug: faction.slug,
      search_text: catalogueSearchText(names),
      name_key: catalogueNameKey(name),
      created_at: catalogueTimestamp(faction.created_at),
      updated_at: catalogueTimestamp(faction.updated_at),
      edited_at: catalogueEditedAt(faction.created_at, faction.updated_at),
      complexity,
      complexity_score: complexityOutOfTen(complexity),
      facets: [...new Set(links.map((link) => link.ruleset_id))].sort(compareCodeUnits),
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(limit);
    return rows.map((row) => row._id);
  },
};

export type FactionCatalogueQuery = FactionCatalogueSearch;

/** A reader's sort as the aggregate orders it: names A to Z, dates newest first. */
function catalogueOrderOf(sort: FactionCatalogueSort | undefined): {
  sort: CatalogueSort;
  direction: CatalogueDirection;
} {
  switch (sort) {
    case 'created':
      return { sort: 'created', direction: 'desc' };
    case 'updated':
      return { sort: 'updated', direction: 'desc' };
    case 'complexity-asc':
      return { sort: 'complexity', direction: 'asc' };
    case 'complexity-desc':
      return { sort: 'complexity', direction: 'desc' };
    case 'name':
    case undefined:
      return { sort: 'name', direction: 'asc' };
  }
}

/** The newest dated entry, and the most recently edited one that is not that arrival. */
async function selectSpotlightEntries(ctx: QueryCtx) {
  const list = (index: 'by_kind_partition_created' | 'by_kind_partition_edited', field: 'created_at' | 'edited_at') =>
    ctx.db
      .query('catalogue_entries')
      .withIndex(index, (q) => q.eq('kind', 'faction').eq('partition', ALL_PARTITION).gt(field, 0))
      .order('desc')
      .take(2);
  const [[newArrival], edited] = await Promise.all([
    list('by_kind_partition_created', 'created_at'),
    list('by_kind_partition_edited', 'edited_at'),
  ]);
  const freshlyUpdated = edited.find((entry) => entry.source_id !== newArrival?.source_id);
  return { newArrival: newArrival ?? null, freshlyUpdated: freshlyUpdated ?? null };
}

/**
 * One page of the Faction catalogue, the same for every viewer.
 * The aggregate counts the list and finds the page's first entry;
 * a search uses Convex's search index over the same entries.
 * Only the visible cards and the two spotlights read card rows.
 * A page past the end answers with no cards and the real page count, so the reader can be told where the catalogue ends.
 */
export async function loadFactionCataloguePage(ctx: QueryCtx, query: FactionCatalogueQuery) {
  const rulesets = await listActiveRulesetSummaries(ctx);
  const activeRulesetById = new Map<string, FactionRulesetSummary>(rulesets.map((ruleset) => [ruleset.id, ruleset]));
  /* An unknown or deleted ruleset narrows nothing; the route drops it from the address. */
  const partition = rulesets.find((ruleset) => ruleset.slug === query.ruleset)?.id ?? ALL_PARTITION;
  const complexity = query.complexity ? parseComplexityRange(query.complexity) : undefined;
  const text = query.q?.slice(0, FACTION_CATALOGUE_QUERY_LIMIT).trim() ?? '';
  const page = parseCataloguePage(query.page) ?? 1;

  const [selection, counts, spotlightEntries] = await Promise.all([
    selectCataloguePage(ctx, {
      kind: 'faction',
      partition,
      ...catalogueOrderOf(query.sort),
      page,
      pageSize: FACTION_CATALOGUE_PAGE_SIZE,
      search: text ? { text, relevance: !query.sort } : undefined,
      complexity,
    }),
    countCataloguePartitions(ctx, 'faction', [ALL_PARTITION, ...rulesets.map((ruleset) => ruleset.id)]),
    selectSpotlightEntries(ctx),
  ]);
  const [catalogueTotal = 0, ...rulesetCounts] = counts;

  const card = async (entry: { source_id: string; facets: string[] } | null) => {
    const factionId = entry ? ctx.db.normalizeId('factions', entry.source_id) : null;
    const row = factionId
      ? await ctx.db
          .query('faction_cards')
          .withIndex('by_faction', (q) => q.eq('faction_id', factionId))
          .unique()
      : null;
    if (!entry || !row || row.is_deleted) {
      /* A listed entry without a live card is drift: the page comes up one card short until the card backfill or the next save. */
      if (entry) {
        console.warn(`Catalogue entry for faction ${entry.source_id} has no live card.`);
      }
      return null;
    }
    return await catalogueFactionFromCard(
      ctx,
      row,
      entry.facets
        .map((facet) => activeRulesetById.get(facet))
        .filter((ruleset): ruleset is FactionRulesetSummary => ruleset != null)
        .sort(compareRulesets)
    );
  };
  const [cards, newArrival, freshlyUpdated] = await Promise.all([
    Promise.all(selection.entries.map((entry) => card(entry))),
    card(spotlightEntries.newArrival),
    card(spotlightEntries.freshlyUpdated),
  ]);

  return {
    cards: cards.filter((faction) => faction != null),
    total: selection.total,
    catalogueTotal,
    complete: selection.exact,
    page,
    pageCount: Math.max(1, Math.ceil(selection.total / FACTION_CATALOGUE_PAGE_SIZE)),
    pageSize: FACTION_CATALOGUE_PAGE_SIZE,
    rulesets: rulesets.map((ruleset, index) => ({ ...ruleset, factionCount: rulesetCounts[index] ?? 0 })),
    spotlights: { newArrival, freshlyUpdated },
  };
}
