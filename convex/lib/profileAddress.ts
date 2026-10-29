import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { isPublicProfile } from './accountLifecycle';

/* Renames away from one address that a lookup follows, newest first, as `formerAddresses` does for the other kinds. */
const FORMER_HOLDERS_READ = 8;

/* A merge folds one profile into another; a chain of them is followed this far, as no account merges that often. */
const MERGE_DEPTH = 16;

/** The profile a merge chain ends in, starting from the given one. */
async function mergedInto(ctx: QueryCtx, profile: Doc<'profiles'> | null) {
  for (let depth = 0; profile?.merged_into_profile_id && depth < MERGE_DEPTH; depth += 1) {
    profile = await ctx.db.get(profile.merged_into_profile_id);
  }
  return profile;
}

/** The newest public profile a rename moved away from this address; a deleted former holder no longer answers for it. */
async function formerProfile(ctx: QueryCtx, slug: string) {
  const rows = await ctx.db
    .query('former_slugs')
    .withIndex('by_kind_and_scope_and_slug', (q) => q.eq('kind', 'profile').eq('scope', '').eq('slug', slug))
    .order('desc')
    .take(FORMER_HOLDERS_READ);
  for (const row of rows) {
    const id = ctx.db.normalizeId('profiles', row.record_id);
    const profile = await mergedInto(ctx, id ? await ctx.db.get('profiles', id) : null);
    if (profile && isPublicProfile(profile)) {
      return profile;
    }
  }
  return null;
}

/**
 * The public profile an address leads to: the one holding the slug, or the newest one a rename moved away from it, each followed through any merge.
 * Null when the address leads to no profile with a public page, so a deleted, pending or merged-away member is nobody.
 * The profile page and the catalogue's member filter resolve an address alike, so an old "All N factions" link keeps naming the member the page did.
 */
export async function loadPublicProfileBySlug(ctx: QueryCtx, slug: string) {
  const held = await ctx.db
    .query('profiles')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  const profile = (await mergedInto(ctx, held)) ?? (await formerProfile(ctx, slug));
  return profile && isPublicProfile(profile) ? profile : null;
}
