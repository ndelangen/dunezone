import type { Infer } from 'convex/values';
import Fuse from 'fuse.js';

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
import { catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueEntryFields, CatalogueKind } from './catalogueEntryShape';
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
 * `faction_cards` stores this output, so a change to it bumps `FACTION_CARD_PROJECTION` and ships a migration that rewrites the cards.
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
  const rows = ownerId
    ? await ctx.db
        .query('factions')
        .withIndex('by_owner_deleted', (q) => q.eq('owner_id', ownerId).eq('is_deleted', false))
        .take(FACTION_LIMIT)
    : await ctx.db
        .query('factions')
        .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
        .take(FACTION_LIMIT);
  const rulesets = await listActiveRulesetSummaries(ctx);
  const linksByFaction = ownerId ? await factionLinksByIndexedReads(ctx, rows) : await factionLinksByScan(ctx);
  const activeRulesetById = new Map(rulesets.map((ruleset) => [ruleset.id, ruleset]));

  const factions = rows.map((row) =>
    toCatalogueFaction(
      row,
      (linksByFaction.get(row._id) ?? [])
        .map((rulesetId) => activeRulesetById.get(rulesetId))
        .filter((ruleset): ruleset is FactionRulesetSummary => ruleset != null)
        .sort(compareRulesets)
    )
  );

  return { factions, rulesets };
}

async function factionLinksByIndexedReads(ctx: QueryCtx, rows: Doc<'factions'>[]) {
  const linksByFaction = new Map<Id<'factions'>, Id<'rulesets'>[]>();
  await Promise.all(
    rows.map(async (row) => {
      const links = await ctx.db
        .query('ruleset_factions')
        .withIndex('by_faction', (q) => q.eq('faction_id', row._id))
        .take(500);
      linksByFaction.set(
        row._id,
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
  const rows = await ctx.db
    .query('factions')
    .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
    .take(FACTION_LIMIT);
  const selected = selectFactionCatalogueSpotlights(rows);
  const preview = (row: Doc<'factions'> | null) => {
    if (!row) {
      return null;
    }
    const faction = parseStoredFactionForRead(row.data);
    return {
      slug: row.slug,
      created_at: row.created_at,
      updated_at: row.updated_at,
      data: {
        name: faction.name,
        logo: faction.logo,
        background: faction.background,
      },
    };
  };
  return {
    newArrival: preview(selected.newArrival),
    freshlyUpdated: preview(selected.freshlyUpdated),
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
    const { name, names, complexity } = factionSearchFields(faction.data);
    return {
      kind: 'faction',
      source_id: faction._id,
      slug: faction.slug,
      search_text: catalogueSearchText(names),
      name_key: catalogueNameKey(name),
      created_at: catalogueTimestamp(faction.created_at),
      updated_at: catalogueTimestamp(faction.updated_at),
      complexity,
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

/*
 * The catalogue reads every faction entry in one bounded scan, about 200 bytes each.
 * Past this many factions the catalogue moves to ordered indexes and an aggregate per order, keeping the same `?page=N` address.
 */
const CATALOGUE_ENTRY_LIMIT = 10_000;

export type FactionCatalogueQuery = FactionCatalogueSearch;

type Ranked = { entry: CatalogueEntryFields; score: number };

/** Name, then id: the order every other order falls back to, so equal keys never swap places between pages. */
function compareEntryIdentity(left: CatalogueEntryFields, right: CatalogueEntryFields) {
  if (left.name_key !== right.name_key) {
    return left.name_key.localeCompare(right.name_key) || (left.name_key < right.name_key ? -1 : 1);
  }
  return left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : 0;
}

function comparatorFor(sort: FactionCatalogueSort | 'relevance'): (left: Ranked, right: Ranked) => number {
  switch (sort) {
    case 'relevance':
      return (left, right) => left.score - right.score || compareEntryIdentity(left.entry, right.entry);
    case 'created':
      return (left, right) =>
        right.entry.created_at - left.entry.created_at || compareEntryIdentity(left.entry, right.entry);
    case 'updated':
      return (left, right) =>
        right.entry.updated_at - left.entry.updated_at || compareEntryIdentity(left.entry, right.entry);
    case 'complexity-asc':
    case 'complexity-desc': {
      const direction = sort === 'complexity-asc' ? 1 : -1;
      return (left, right) =>
        ((left.entry.complexity ?? 0) - (right.entry.complexity ?? 0)) * direction ||
        compareEntryIdentity(left.entry, right.entry);
    }
    case 'name':
      return (left, right) => compareEntryIdentity(left.entry, right.entry);
  }
}

/** Typo-tolerant search over the faction, Faction leader and leader names, each name scored on its own. */
function searchEntries(entries: CatalogueEntryFields[], query: string): Ranked[] {
  return new Fuse(entries, {
    keys: [{ name: 'names', getFn: (entry) => entry.search_text.split('\n') }],
    ignoreLocation: true,
    /* A short name and a long one score alike for the same match, so relevance does not favour terse names. */
    ignoreFieldNorm: true,
    threshold: 0.35,
    includeScore: true,
  })
    .search(query)
    .map((result) => ({ entry: result.item, score: result.score ?? 0 }));
}

/** Newest first among dated entries, ties to the lower id; the freshly updated pick changed since it was created and is never the new arrival. */
function selectSpotlightEntries(entries: CatalogueEntryFields[]) {
  const newest = (field: 'created_at' | 'updated_at', candidates: CatalogueEntryFields[]) =>
    candidates.reduce<CatalogueEntryFields | null>(
      (best, entry) =>
        !best || entry[field] > best[field] || (entry[field] === best[field] && entry.source_id < best.source_id)
          ? entry
          : best,
      null
    );
  const newArrival = newest(
    'created_at',
    entries.filter((entry) => entry.created_at > 0)
  );
  const freshlyUpdated = newest(
    'updated_at',
    entries.filter((entry) => entry !== newArrival && entry.created_at > 0 && entry.updated_at > entry.created_at)
  );
  return { newArrival, freshlyUpdated };
}

/**
 * One page of the Faction catalogue, the same for every viewer.
 * Filters, search and order run over the slim entries;
 * only the visible page and the two spotlights read whole factions.
 * A page past the end answers with no cards and the real page count, so the reader can be told where the catalogue ends.
 */
export async function loadFactionCataloguePage(ctx: QueryCtx, query: FactionCatalogueQuery) {
  const [entries, rulesets] = await Promise.all([
    ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind', (q) => q.eq('kind', 'faction'))
      .take(CATALOGUE_ENTRY_LIMIT),
    listActiveRulesetSummaries(ctx),
  ]);
  if (entries.length === CATALOGUE_ENTRY_LIMIT) {
    /* Past the bound the totals and the last pages are short; the catalogue is due its move to ordered indexes. */
    console.error(
      `Faction catalogue read its ${CATALOGUE_ENTRY_LIMIT}-entry bound; totals and later pages are incomplete.`
    );
  }
  const activeRulesetById = new Map<string, FactionRulesetSummary>(rulesets.map((ruleset) => [ruleset.id, ruleset]));

  const factionCountByRuleset = new Map<string, number>();
  for (const entry of entries) {
    for (const facet of entry.facets) {
      factionCountByRuleset.set(facet, (factionCountByRuleset.get(facet) ?? 0) + 1);
    }
  }

  /* An unknown or deleted ruleset narrows nothing; the route drops it from the address. */
  const rulesetId = rulesets.find((ruleset) => ruleset.slug === query.ruleset)?.id;
  const [low, high] = parseComplexityRange(query.complexity);
  const filtered = entries.filter((entry) => {
    if (rulesetId && !entry.facets.includes(rulesetId)) {
      return false;
    }
    const score = complexityOutOfTen(entry.complexity ?? 0);
    return score >= low && score <= high;
  });

  const text = query.q?.slice(0, FACTION_CATALOGUE_QUERY_LIMIT).trim() ?? '';
  const ranked = text ? searchEntries(filtered, text) : filtered.map((entry) => ({ entry, score: 0 }));
  ranked.sort(comparatorFor(query.sort ?? (text ? 'relevance' : 'name')));

  const total = ranked.length;
  const pageCount = Math.max(1, Math.ceil(total / FACTION_CATALOGUE_PAGE_SIZE));
  const page = parseCataloguePage(query.page) ?? 1;
  const visible = ranked.slice((page - 1) * FACTION_CATALOGUE_PAGE_SIZE, page * FACTION_CATALOGUE_PAGE_SIZE);

  const card = async (entry: CatalogueEntryFields | null) => {
    const factionId = entry ? ctx.db.normalizeId('factions', entry.source_id) : null;
    const row = factionId ? await ctx.db.get('factions', factionId) : null;
    if (!entry || !row || row.is_deleted) {
      return null;
    }
    return toCatalogueFaction(
      row,
      entry.facets
        .map((facet) => activeRulesetById.get(facet))
        .filter((ruleset): ruleset is FactionRulesetSummary => ruleset != null)
        .sort(compareRulesets)
    );
  };
  const spotlightEntries = selectSpotlightEntries(entries);
  const [cards, newArrival, freshlyUpdated] = await Promise.all([
    Promise.all(visible.map(({ entry }) => card(entry))),
    card(spotlightEntries.newArrival),
    card(spotlightEntries.freshlyUpdated),
  ]);

  return {
    cards: cards.filter((faction) => faction != null),
    total,
    catalogueTotal: entries.length,
    page,
    pageCount,
    pageSize: FACTION_CATALOGUE_PAGE_SIZE,
    rulesets: rulesets.map((ruleset) => ({ ...ruleset, factionCount: factionCountByRuleset.get(ruleset.id) ?? 0 })),
    spotlights: { newArrival, freshlyUpdated },
  };
}
