import type { QueryCtx } from '../types';
import { liveGroupOrNull } from './collaborativeAccess';
import { loadFactionCatalogue } from './factionCatalogue';
import { loadFaqAnswersGivenBy, loadFaqQuestionsAskedBy } from './faqProfileActivity';

const PROFILE_DETAIL_LIMIT = 500;

/**
 * Profile-detail read model.
 * Owns the joins, visibility rules (active memberships only, soft-deleted factions excluded, faction rulesets limited to active ones), and ordering (FAQ activity newest first, faction rulesets by name, Groups in membership order) behind `api.profiles.getBySlug`.
 * The runtime wire contract is `profileDetailPageValidator`;
 * the precise TS projection (parsed faction data included) is inferred from this loader.
 */
export async function loadProfileDetailBySlug(ctx: QueryCtx, slug: string) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!profile) {
    throw new Error(`Profile with slug ${slug} not found`);
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

  const { factions } = await loadFactionCatalogue(ctx, { ownerId: profile.user_id });

  return {
    profile,
    faqAsked,
    faqAnswers,
    factions,
    groupSummaries,
  };
}

export type ProfileDetailProjection = Awaited<ReturnType<typeof loadProfileDetailBySlug>>;
