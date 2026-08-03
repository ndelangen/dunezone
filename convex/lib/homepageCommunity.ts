import { DirectAggregate } from '@convex-dev/aggregate';

import { components } from '../_generated/api';
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
  Namespace: HomepageCommunityMetric;
  Key: null;
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

export async function countHomepageCommunityMetric(ctx: QueryCtx, metric: HomepageCommunityMetric) {
  return await homepageCommunity.count(ctx, { namespace: metric });
}
