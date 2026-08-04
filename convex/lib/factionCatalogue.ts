import { CanonicalFactionStoredSchema } from '../../src/game/schema/faction';
import type { FactionInput } from '../../src/game/schema/faction';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

export type FactionRulesetSummary = {
  id: Id<'rulesets'>;
  slug: string;
  name: string;
};

export type CatalogueFaction = Omit<Doc<'factions'>, 'data'> & {
  data: FactionInput;
  rulesets: FactionRulesetSummary[];
};

export async function listActiveRulesetSummaries(ctx: QueryCtx): Promise<FactionRulesetSummary[]> {
  const rows = await ctx.db
    .query('rulesets')
    .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
    .take(500);

  return rows.map((row) => ({ id: row._id, slug: row.slug, name: row.name }));
}

export async function enrichFactionsWithRulesets(
  ctx: QueryCtx,
  rows: Doc<'factions'>[],
  activeRulesets: FactionRulesetSummary[]
): Promise<CatalogueFaction[]> {
  const activeRulesetById = new Map(activeRulesets.map((ruleset) => [ruleset.id, ruleset]));

  return await Promise.all(
    rows.map(async (row) => {
      const links = await ctx.db
        .query('ruleset_factions')
        .withIndex('by_faction', (q) => q.eq('faction_id', row._id))
        .take(500);
      const rulesets = links
        .map((link) => activeRulesetById.get(link.ruleset_id))
        .filter((ruleset): ruleset is FactionRulesetSummary => ruleset != null)
        .sort(compareRulesets);

      return {
        ...row,
        data: CanonicalFactionStoredSchema.parse(row.data),
        rulesets,
      };
    })
  );
}

export async function loadFactionCatalogueSpotlights(ctx: QueryCtx) {
  const rows = await ctx.db
    .query('factions')
    .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
    .take(500);
  const rulesets = await listActiveRulesetSummaries(ctx);
  const factions = await enrichFactionsWithRulesets(ctx, rows, rulesets);
  return selectFactionCatalogueSpotlights(factions);
}

/** Homepage spotlights omit ruleset enrichment because they only render faction identity. */
export async function loadFactionCatalogueSpotlightPreviews(ctx: QueryCtx) {
  const rows = await ctx.db
    .query('factions')
    .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
    .take(500);
  const selected = selectFactionCatalogueSpotlights(rows);
  const preview = (row: Doc<'factions'> | null) => {
    if (!row) {
      return null;
    }
    const faction = CanonicalFactionStoredSchema.parse(row.data);
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

export function selectFactionCatalogueSpotlights<
  T extends Pick<Doc<'factions'>, '_id' | 'created_at' | 'updated_at'>,
>(factions: T[]) {
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

function compareFactionIdentity(
  left: Pick<Doc<'factions'>, '_id'>,
  right: Pick<Doc<'factions'>, '_id'>
) {
  return String(left._id).localeCompare(String(right._id));
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
