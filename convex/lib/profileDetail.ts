import { ConvexError } from 'convex/values';

import type { ProfileFaqPages } from '../../src/shared/profiles/faqActivity';
import type { QueryCtx } from '../types';
import { isPublicProfile } from './accountLifecycle';
import { liveGroupOrNull } from './collaborativeAccess';
import { loadOwnerFactionPreview } from './factionCatalogue';
import { loadFaqAnswersGivenBy, loadFaqQuestionsAskedBy, loadProfileFaqLists } from './faqProfileActivity';

const PROFILE_DETAIL_LIMIT = 500;

/** Factions the profile shows; "All N factions" opens the catalogue narrowed to the member for the rest. */
export const PROFILE_FACTION_PREVIEW_SIZE = 6;

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
 * Profile-detail read model.
 * Owns the joins, visibility rules (active memberships only, soft-deleted factions excluded, faction rulesets limited to active ones), and ordering (FAQ activity newest first, factions newest first, faction rulesets by name, Groups in membership order) behind `api.profiles.pageBySlug`.
 * The factions are the first few of the catalogue's list for the member, with that list's count;
 * the catalogue narrowed to the member holds the rest.
 * The same for every viewer: the viewer's own sign-in methods are `api.profiles.settings`, never part of a profile page.
 * The runtime wire contract is `profilePageValidator`;
 * the precise TS projection (parsed faction data included) is inferred from this loader.
 */
export async function loadProfilePageBySlug(ctx: QueryCtx, slug: string, pages: ProfileFaqPages = {}) {
  /* An address no profile holds may be one a rename left, and the page's own redirect then moves the visitor on. */
  let profile =
    (await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()) ?? (await formerProfile(ctx, slug));
  for (let depth = 0; profile?.merged_into_profile_id && depth < 16; depth += 1) {
    profile = await ctx.db.get(profile.merged_into_profile_id);
  }
  if (!profile || !isPublicProfile(profile)) {
    throw new ConvexError({ code: 'NOT_FOUND', message: `Profile with slug ${slug} not found` });
  }

  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', profile.user_id).eq('status', 'active'))
    .take(PROFILE_DETAIL_LIMIT);
  const groupsWithNulls = await Promise.all(memberships.map((membership) => ctx.db.get('groups', membership.group_id)));
  const groups = groupsWithNulls.flatMap((group) => {
    const live = liveGroupOrNull(group);
    return live ? [live] : [];
  });
  /* Public profile callers count and render only live active Groups. A dangling or
   * soft-deleted membership cannot become a safe identity summary (ADR-0003). */
  const groupSummaries = groups.map((group) => ({
    id: group._id,
    name: group.name,
    slug: group.slug,
  }));

  const [faqAsked, faqAnswers] = await Promise.all([
    loadFaqQuestionsAskedBy(ctx, profile.user_id),
    loadFaqAnswersGivenBy(ctx, profile.user_id),
  ]);

  const { factions, factionCount } = await loadOwnerFactionPreview(ctx, profile.user_id, PROFILE_FACTION_PREVIEW_SIZE);

  const faqLists = await loadProfileFaqLists(ctx, faqAsked, faqAnswers, pages);

  return { profile, faqAsked, faqAnswers, faqLists, factions, factionCount, groupSummaries };
}

export type ProfileDetailProjection = Awaited<ReturnType<typeof loadProfilePageBySlug>>;
