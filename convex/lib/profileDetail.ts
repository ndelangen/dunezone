import { ConvexError } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { isPublicProfile } from './accountLifecycle';
import { liveGroupOrNull } from './collaborativeAccess';
import { loadFactionCatalogue } from './factionCatalogue';
import { loadFaqAnswersGivenBy, loadFaqQuestionsAskedBy } from './faqProfileActivity';

const PROFILE_DETAIL_LIMIT = 500;

/* Renames away from one address that a lookup follows, newest first, as `formerAddresses` does for the other kinds. */
const FORMER_HOLDERS_READ = 8;

/** The newest public profile a rename moved away from this address; a deleted former holder no longer answers for it. */
async function formerProfile(ctx: QueryCtx, slug: string) {
  const rows = await ctx.db
    .query('former_slugs')
    .withIndex('by_kind_and_scope_and_slug', (q) => q.eq('kind', 'profile').eq('scope', '').eq('slug', slug))
    .order('desc')
    .take(FORMER_HOLDERS_READ);
  for (const row of rows) {
    const id = ctx.db.normalizeId('profiles', row.record_id);
    let profile = id ? await ctx.db.get('profiles', id) : null;
    for (let depth = 0; profile?.merged_into_profile_id && depth < 16; depth += 1) {
      profile = await ctx.db.get(profile.merged_into_profile_id);
    }
    if (profile && isPublicProfile(profile)) {
      return profile;
    }
  }
  return null;
}

/**
 * The public profile an address names: the holder of the slug, or the newest public profile a rename moved away from it, followed through any merge.
 * Null when none;
 * a page redirects when the profile's own slug differs from the address.
 */
export async function publicProfileBySlug(ctx: QueryCtx, slug: string) {
  let profile =
    (await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()) ?? (await formerProfile(ctx, slug));
  for (let depth = 0; profile?.merged_into_profile_id && depth < 16; depth += 1) {
    profile = await ctx.db.get(profile.merged_into_profile_id);
  }
  return profile && isPublicProfile(profile) ? profile : null;
}

/** The live Groups a member is in, in membership order, as the profile page lists them. */
export async function loadProfileGroupSummaries(ctx: QueryCtx, userId: Id<'users'>) {
  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
    .take(PROFILE_DETAIL_LIMIT);
  const groupsWithNulls = await Promise.all(memberships.map((membership) => ctx.db.get('groups', membership.group_id)));
  /* Public profile callers count and render only live active Groups. A dangling or
   * soft-deleted membership cannot become a safe identity summary (ADR-0003). */
  return groupsWithNulls.flatMap((group) => {
    const live = liveGroupOrNull(group);
    return live ? [{ id: live._id, name: live.name, slug: live.slug }] : [];
  });
}

/**
 * Profile-detail read model.
 * Owns the joins, visibility rules (active memberships only, soft-deleted factions excluded, faction rulesets limited to active ones), and ordering (FAQ activity newest first, faction rulesets by name, Groups in membership order) behind `api.profiles.pageBySlug`.
 * The same for every viewer: the viewer's own sign-in methods are `api.profiles.settings`, never part of a profile page.
 * The runtime wire contract is `profilePageValidator`;
 * the precise TS projection (parsed faction data included) is inferred from this loader.
 */
export async function loadProfilePageBySlug(ctx: QueryCtx, slug: string) {
  /* An address no profile holds may be one a rename left, and the page's own redirect then moves the visitor on. */
  const profile = await publicProfileBySlug(ctx, slug);
  if (!profile) {
    throw new ConvexError({ code: 'NOT_FOUND', message: `Profile with slug ${slug} not found` });
  }

  const groupSummaries = await loadProfileGroupSummaries(ctx, profile.user_id);

  const [faqAsked, faqAnswers] = await Promise.all([
    loadFaqQuestionsAskedBy(ctx, profile.user_id),
    loadFaqAnswersGivenBy(ctx, profile.user_id),
  ]);

  const { factions } = await loadFactionCatalogue(ctx, {
    ownerId: profile.user_id,
  });

  return { profile, faqAsked, faqAnswers, factions, groupSummaries };
}

export type ProfileDetailProjection = Awaited<ReturnType<typeof loadProfilePageBySlug>>;
