import { v } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import schema from '../schema';
import type { QueryCtx } from '../types';

export const rulebookMetadataValidator = schema.tables.rulebooks.validator.omit('name_key').extend({
  _id: v.id('rulebooks'),
  _creationTime: v.number(),
});

export function rulebookMetadata(row: Doc<'rulebooks'>) {
  const { name_key: _nameKey, ...metadata } = row;
  return metadata;
}

/** The complete saved order is shared by the Ruleset listing and same-Ruleset clone choices. */
export async function listRulesetRulebooks(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const rows = await ctx.db
    .query('rulebooks')
    .withIndex('by_ruleset_and_is_deleted_and_sort_order', (q) => q.eq('ruleset_id', rulesetId).eq('is_deleted', false))
    .collect();
  return rows.map(rulebookMetadata);
}
