import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { allocateCounterSlug } from './slugCounters';
import { slugify } from './utils';

/** Fold provider names only for URLs; the profile keeps its original display name. */
export function profileBootstrapSlug(username: string) {
  return slugify(username.normalize('NFKD').replace(/\p{M}/gu, '')) || 'player';
}

export async function allocateProfileSlug(ctx: MutationCtx, base: string, own?: Doc<'profiles'>) {
  if (own && profileBootstrapSlug(own.username ?? 'nameless') === base) {
    return own.slug;
  }
  return await allocateCounterSlug(ctx, `profile-slug:${JSON.stringify([base])}`, base, async (slug) => {
    const holder = await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    return !holder || holder._id === own?._id;
  });
}
