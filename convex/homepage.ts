import { v } from 'convex/values';

import { query } from './_generated/server';
import { loadFactionCatalogueSpotlightPreviews } from './lib/factionCatalogue';
import {
  countHomepageCommunityMetric,
  HOMEPAGE_COMMUNITY_METRICS,
  loadHomepageNewestMemberIds,
} from './lib/homepageCommunity';

const HOMEPAGE_MIGRATION_IDS = [
  'homepage_factions_v1',
  'homepage_rulesets_v1',
  'homepage_members_v1',
] as const;

const spotlightValidator = v.object({
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  data: v.object({
    name: v.string(),
    logo: v.any(),
    background: v.any(),
  }),
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
          username: v.string(),
          avatarUrl: v.string(),
          createdAt: v.string(),
        })
      ),
    }),
  }),
  handler: async (ctx) => {
    const [spotlights, newestMembers, ...migrationRuns] = await Promise.all([
      loadFactionCatalogueSpotlightPreviews(ctx),
      loadHomepageNewestMemberIds(ctx).then((ids) => Promise.all(ids.map((id) => ctx.db.get(id)))),
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
        newestMembers: newestMembers
          .filter((profile): profile is NonNullable<typeof profile> => profile != null)
          .map((profile) => ({
            id: profile._id,
            slug: profile.slug,
            username: profile.username as string,
            avatarUrl: profile.avatar_url as string,
            createdAt: profile.created_at,
          })),
      },
    };
  },
});
