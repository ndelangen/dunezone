import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { enrichFactionsWithRulesets, listActiveRulesetSummaries } from './factionCatalogue';
import type { CatalogueFaction } from './factionCatalogue';
import { listFaqAnswersGivenBy, listFaqQuestionsAskedBy } from './faqActivity';
import type { FaqAnswerGivenByUser, FaqQuestionAskedByUser } from './faqActivity';

const PROFILE_DETAIL_LIMIT = 500;

/**
 * Public profile-page projection. Faction `data` is validated through the canonical faction Zod
 * schema, whose shape is impractical to restate as a Convex `returns` validator; this exported type
 * is the client-facing contract, exercised by `convex/profiles.detail.test.ts`.
 */
export type ProfileDetailProjection = {
  profile: Doc<'profiles'>;
  memberships: Doc<'group_members'>[];
  groups: Doc<'groups'>[];
  faqAsked: FaqQuestionAskedByUser[];
  faqAnswers: FaqAnswerGivenByUser[];
  factions: CatalogueFaction[];
};

/**
 * Profile-detail read model. Owns the joins, visibility rules (active memberships only,
 * soft-deleted factions excluded, faction rulesets limited to active ones), and ordering (FAQ
 * activity newest first, faction rulesets by name, groups in membership order) behind
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

  const [faqAsked, faqAnswers] = await Promise.all([
    listFaqQuestionsAskedBy(ctx, profile.user_id),
    listFaqAnswersGivenBy(ctx, profile.user_id),
  ]);

  const factionRows = await ctx.db
    .query('factions')
    .withIndex('by_owner_deleted', (q) => q.eq('owner_id', profile.user_id).eq('is_deleted', false))
    .take(PROFILE_DETAIL_LIMIT);
  const activeRulesets = await listActiveRulesetSummaries(ctx);
  const factions = await enrichFactionsWithRulesets(ctx, factionRows, activeRulesets);

  return {
    profile,
    memberships,
    groups,
    faqAsked,
    faqAnswers,
    factions,
  };
}
