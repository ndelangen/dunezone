import { DirectAggregate } from '@convex-dev/aggregate';

import { components } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export const HOMEPAGE_COMMUNITY_METRICS = [
  'factions',
  'rulesets',
  'members',
  'questions',
  'answers',
] as const;

export type HomepageCommunityMetric = (typeof HOMEPAGE_COMMUNITY_METRICS)[number];

const homepageCommunity = new DirectAggregate<{
  Namespace: HomepageCommunityMetric | 'newestMembers';
  Key: string | null;
  Id: string;
}>(components.homepageCommunity);

export async function setHomepageCommunityPresence(
  ctx: MutationCtx,
  metric: HomepageCommunityMetric,
  id: string,
  present: boolean
) {
  const item = { namespace: metric, key: null, id } as const;
  if (present) {
    await homepageCommunity.insertIfDoesNotExist(ctx, item);
  } else {
    await homepageCommunity.deleteIfExists(ctx, item);
  }
}

export function isHomepageNewestMemberEligible(
  profile: Pick<Doc<'profiles'>, 'username' | 'avatar_url' | 'slug' | 'created_at'>
) {
  return (
    (profile.username?.trim().length ?? 0) > 0 &&
    (profile.avatar_url?.trim().length ?? 0) > 0 &&
    profile.slug.trim().length !== 0 &&
    profile.slug !== 'user' &&
    profile.slug !== 'nameless' &&
    Number.isFinite(Date.parse(profile.created_at))
  );
}

export async function syncHomepageNewestMember(ctx: MutationCtx, profile: Doc<'profiles'>) {
  const item = {
    namespace: 'newestMembers',
    key: profile.created_at,
    id: profile._id,
  } as const;
  if (isHomepageNewestMemberEligible(profile)) {
    await homepageCommunity.insertIfDoesNotExist(ctx, item);
  } else {
    await removeHomepageNewestMember(ctx, profile);
  }
}

export async function removeHomepageNewestMember(ctx: MutationCtx, profile: Doc<'profiles'>) {
  await homepageCommunity.deleteIfExists(ctx, {
    namespace: 'newestMembers',
    key: profile.created_at,
    id: profile._id,
  });
}

export async function loadHomepageNewestMemberIds(ctx: QueryCtx) {
  const { page } = await homepageCommunity.paginate(ctx, {
    namespace: 'newestMembers',
    order: 'desc',
    pageSize: 4,
  });
  return page.map((item) => item.id as Id<'profiles'>);
}

/** Keep each ruleset's eligible FAQ totals as one aggregate item per metric. */
export async function setHomepageRulesetFaqTotals(
  ctx: MutationCtx,
  rulesetId: Id<'rulesets'>,
  active: boolean,
  questions: number,
  answers: number
) {
  const id = `ruleset:${rulesetId}`;
  for (const [namespace, sumValue] of [
    ['questions', questions],
    ['answers', answers],
  ] as const) {
    const item = { namespace, key: null, id } as const;
    if (active) {
      await homepageCommunity.replaceOrInsert(ctx, item, {
        namespace,
        key: null,
        sumValue,
      });
    } else {
      await homepageCommunity.deleteIfExists(ctx, item);
    }
  }
}

/** Adjust a live ruleset's FAQ totals in the same transaction as the source write. */
export async function adjustHomepageRulesetFaqTotals(
  ctx: MutationCtx,
  rulesetId: Id<'rulesets'>,
  delta: { questions?: number; answers?: number }
) {
  const ruleset = await ctx.db.get(rulesetId);
  if (!ruleset) throw new Error(`Ruleset ${rulesetId} not found`);
  const questions = (ruleset.homepage_question_count ?? 0) + (delta.questions ?? 0);
  const answers = (ruleset.homepage_answer_count ?? 0) + (delta.answers ?? 0);
  if (questions < 0 || answers < 0) throw new Error('Homepage FAQ totals cannot be negative');
  await ctx.db.patch(rulesetId, {
    homepage_question_count: questions,
    homepage_answer_count: answers,
  });
  await setHomepageRulesetFaqTotals(ctx, rulesetId, !ruleset.is_deleted, questions, answers);
}

export async function countHomepageCommunityMetric(ctx: QueryCtx, metric: HomepageCommunityMetric) {
  return metric === 'questions' || metric === 'answers'
    ? await homepageCommunity.sum(ctx, { namespace: metric })
    : await homepageCommunity.count(ctx, { namespace: metric });
}
