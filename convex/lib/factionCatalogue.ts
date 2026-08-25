import type { Infer } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
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
 */
export function toCatalogueFaction(row: Doc<'factions'>, rulesets: FactionRulesetSummary[]): CatalogueFaction {
  const { name, logo, background, hero, leaders, complexity } = parseStoredFactionForRead(row.data);
  return {
    _id: row._id,
    slug: row.slug,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data: { name, logo, background, hero, leaders, complexity },
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
