import { v } from 'convex/values';

import { query } from './_generated/server';
import { loadFactionCatalogueSpotlights } from './lib/factionCatalogue';
import { countHomepageCommunityMetric, HOMEPAGE_COMMUNITY_METRICS } from './lib/homepageCommunity';

const HOMEPAGE_MIGRATION_IDS = [
  'homepage_factions_v1',
  'homepage_rulesets_v1',
  'homepage_members_v1',
  'homepage_questions_v1',
  'homepage_answers_v1',
] as const;

const rulesetSummaryValidator = v.object({
  id: v.id('rulesets'),
  slug: v.string(),
  name: v.string(),
});

const spotlightValidator = v.object({
  _id: v.id('factions'),
  _creationTime: v.number(),
  owner_id: v.id('users'),
  data: v.any(),
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  is_deleted: v.boolean(),
  group_id: v.union(v.id('groups'), v.null()),
  rulesets: v.array(rulesetSummaryValidator),
});

const metricCountsValidator = v.object({
  factions: v.number(),
  rulesets: v.number(),
  members: v.number(),
  questions: v.number(),
  answers: v.number(),
});

export const page = query({
  args: {},
  returns: v.object({
    spotlights: v.object({
      newArrival: v.union(spotlightValidator, v.null()),
      freshlyUpdated: v.union(spotlightValidator, v.null()),
    }),
    community: v.object({
      counts: v.union(metricCountsValidator, v.null()),
      newestMembers: v.array(
        v.object({
          id: v.id('profiles'),
          slug: v.string(),
          username: v.union(v.string(), v.null()),
          avatarUrl: v.string(),
        })
      ),
    }),
  }),
  handler: async (ctx) => {
    const [spotlights, newestMembers, ...migrationRuns] = await Promise.all([
      loadFactionCatalogueSpotlights(ctx),
      ctx.db
        .query('profiles')
        .order('desc')
        .filter((q) => q.and(q.neq(q.field('avatar_url'), null), q.neq(q.field('avatar_url'), '')))
        .take(4),
      ...HOMEPAGE_MIGRATION_IDS.map((id) =>
        ctx.db
          .query('migration_runs')
          .withIndex('by_migration_id', (q) => q.eq('migration_id', id))
          .unique()
      ),
    ]);

    const countsReady = migrationRuns.every((run) => run?.is_done && run.state === 'success');
    const metricValues = countsReady
      ? await Promise.all(
          HOMEPAGE_COMMUNITY_METRICS.map((metric) => countHomepageCommunityMetric(ctx, metric))
        )
      : null;
    const counts = metricValues
      ? {
          factions: metricValues[0],
          rulesets: metricValues[1],
          members: metricValues[2],
          questions: metricValues[3],
          answers: metricValues[4],
        }
      : null;

    return {
      spotlights,
      community: {
        counts,
        newestMembers: newestMembers.map((profile) => ({
          id: profile._id,
          slug: profile.slug,
          username: profile.username,
          avatarUrl: profile.avatar_url as string,
        })),
      },
    };
  },
});
