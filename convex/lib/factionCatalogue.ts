import {
  type FactionInput,
  FactionStoredSchema,
  type LegacyFactionInput,
  toLegacyFactionInput,
} from '../../src/game/schema/faction';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

export type FactionRulesetSummary = {
  id: Id<'rulesets'>;
  slug: string;
  name: string;
};

export type CatalogueFaction = Omit<Doc<'factions'>, 'data'> & {
  data: FactionInput | LegacyFactionInput;
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
  activeRulesets: FactionRulesetSummary[],
  backgroundFormat?: 'canonical'
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

      const canonicalData = FactionStoredSchema.parse(row.data);
      return {
        ...row,
        data:
          backgroundFormat === 'canonical' ? canonicalData : toLegacyFactionInput(canonicalData),
        rulesets,
      };
    })
  );
}

export function selectFactionCatalogueSpotlights(factions: CatalogueFaction[]) {
  const newArrival = [...factions]
    .filter((faction) => parseTimestamp(faction.created_at) != null)
    .sort((left, right) => compareByDate(left, right, 'created_at'))[0];

  const freshlyUpdated = [...factions]
    .filter((faction) => {
      if (faction._id === newArrival?._id) return false;
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
  left: CatalogueFaction,
  right: CatalogueFaction,
  field: 'created_at' | 'updated_at'
) {
  const leftTimestamp = parseTimestamp(left[field]);
  const rightTimestamp = parseTimestamp(right[field]);
  if (leftTimestamp == null && rightTimestamp == null) return compareFactionIdentity(left, right);
  if (leftTimestamp == null) return 1;
  if (rightTimestamp == null) return -1;
  return rightTimestamp - leftTimestamp || compareFactionIdentity(left, right);
}

function compareFactionIdentity(left: CatalogueFaction, right: CatalogueFaction) {
  return (
    left.data.name.localeCompare(right.data.name) ||
    String(left._id).localeCompare(String(right._id))
  );
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
