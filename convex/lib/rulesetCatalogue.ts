import type { RulesetCatalogueSort } from '../../src/shared/rulesets/catalogueSearch';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';
import type { CatalogueDirection, CatalogueSort } from './catalogueOrder';

/** A reader's sort as the aggregate orders it: names A to Z, dates newest first. */
export function rulesetCatalogueOrderOf(sort: RulesetCatalogueSort | undefined): {
  sort: CatalogueSort;
  direction: CatalogueDirection;
} {
  switch (sort) {
    case 'newest':
      return { sort: 'created', direction: 'desc' };
    case 'name':
    case undefined:
      return { sort: 'name', direction: 'asc' };
  }
}

/**
 * The ruleset kind of `catalogue_entries`: one entry per live ruleset, in the one `'all'` list.
 * A ruleset is found by its name.
 */
export const rulesetCatalogueKind: CatalogueKind = {
  sorts: ['name', 'created'],
  expected: async (ctx, sourceId) => {
    const rulesetId = ctx.db.normalizeId('rulesets', sourceId);
    const ruleset = rulesetId ? await ctx.db.get('rulesets', rulesetId) : null;
    if (!ruleset || ruleset.is_deleted) {
      return null;
    }
    return {
      kind: 'ruleset',
      source_id: ruleset._id,
      slug: ruleset.slug,
      search_text: catalogueSearchText([ruleset.name]),
      name_key: catalogueNameKey(ruleset.name),
      created_at: catalogueTimestamp(ruleset.created_at),
      updated_at: catalogueTimestamp(ruleset.updated_at),
      edited_at: catalogueEditedAt(ruleset.created_at, ruleset.updated_at),
      complexity: 0,
      complexity_score: 0,
      facets: [],
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(limit);
    return rows.map((row) => row._id);
  },
};
