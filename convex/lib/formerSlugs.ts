import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { MutationCtx } from '../_generated/server';

/**
 * One address a record left when a rename moved it.
 * `scope` is what the slug is unique within: the Asset type the address used, the Ruleset for a Rulebook, and nothing for the global kinds.
 * The row names the record rather than its new slug, so a later rename still resolves the old address to the record's current one.
 */
export const formerSlugValidator = v.object({
  kind: v.union(
    v.literal('faction'),
    v.literal('asset'),
    v.literal('group'),
    v.literal('ruleset'),
    v.literal('rulebook'),
    v.literal('profile')
  ),
  scope: v.string(),
  slug: v.string(),
  record_id: v.union(
    v.id('factions'),
    v.id('assets'),
    v.id('groups'),
    v.id('rulesets'),
    v.id('rulebooks'),
    v.id('profiles')
  ),
});

export type FormerSlug = Infer<typeof formerSlugValidator>;

/**
 * Records the address a rename just left, in the rename's own transaction.
 * The newest row for an address decides where it leads, so a row is written only when that address last led somewhere else.
 */
export async function recordFormerSlug(ctx: MutationCtx, former: FormerSlug) {
  const latest = await ctx.db
    .query('former_slugs')
    .withIndex('by_kind_and_scope_and_slug', (q) =>
      q.eq('kind', former.kind).eq('scope', former.scope).eq('slug', former.slug)
    )
    .order('desc')
    .first();
  if (latest?.record_id !== former.record_id) {
    await ctx.db.insert('former_slugs', former);
  }
}
