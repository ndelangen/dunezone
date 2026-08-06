import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import type { AssignedGroupSummary } from './collaborativeAccess';
import { enrichFactionsWithRulesets, listActiveRulesetSummaries } from './factionCatalogue';
import type { CatalogueFaction } from './factionCatalogue';
import { loadFaqAnswersGivenBy, loadFaqQuestionsAskedBy } from './faqProfileActivity';

const PROFILE_DETAIL_LIMIT = 500;

/**
 * Public profile-page projection. The runtime contract is `profileDetailPageValidator` in
 * `collaborativeAccessValidators.ts`; this type restates it with the parsed faction shape the
 * enrichment helpers guarantee.
 */
export type ProfileDetailProjection = {
  profile: Doc<'profiles'>;
  faqAsked: Awaited<ReturnType<typeof loadFaqQuestionsAskedBy>>;
  faqAnswers: Awaited<ReturnType<typeof loadFaqAnswersGivenBy>>;
  factions: CatalogueFaction[];
  groupSummaries: AssignedGroupSummary[];
};

/**
 * Profile-detail read model. Owns the joins, visibility rules (active memberships only,
 * soft-deleted factions excluded, faction rulesets limited to active ones), and ordering (FAQ
 * activity newest first, faction rulesets by name, Groups in membership order) behind
 * `api.profiles.getBySlug`.
 */
export async function loadProfileDetailBySlug(
  ctx: QueryCtx,
  slug: string
): Promise<ProfileDetailProjection> {
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
  const groupsWithNulls = await Promise.all(
    memberships.map((membership) => ctx.db.get('groups', membership.group_id))
  );
  const groups = groupsWithNulls.filter(
    (group): group is NonNullable<(typeof groupsWithNulls)[number]> => group !== null
  );
  // Public profile callers count and render only resolvable active Groups. A dangling
  // membership cannot become a safe identity summary.
  const groupSummaries = groups.map((group) => ({
    id: group._id,
    name: group.name,
    slug: group.slug,
  }));

  const [faqAsked, faqAnswers] = await Promise.all([
    loadFaqQuestionsAskedBy(ctx, profile.user_id),
    loadFaqAnswersGivenBy(ctx, profile.user_id),
  ]);

  const factionRows = await ctx.db
    .query('factions')
    .withIndex('by_owner_deleted', (q) => q.eq('owner_id', profile.user_id).eq('is_deleted', false))
    .take(PROFILE_DETAIL_LIMIT);
  const activeRulesets = await listActiveRulesetSummaries(ctx);
  const factions = await enrichFactionsWithRulesets(ctx, factionRows, activeRulesets);

  return {
    profile,
    faqAsked,
    faqAnswers,
    factions,
    groupSummaries,
  };
}
