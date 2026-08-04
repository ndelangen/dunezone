import { v } from 'convex/values';

import { query } from './_generated/server';
import { loadFactionCatalogueSpotlightPreviews } from './lib/factionCatalogue';
import {
  countHomepageCommunityMetric,
  HOMEPAGE_COMMUNITY_METRICS,
  loadHomepageNewestMemberIds,
} from './lib/homepageCommunity';
import { isProfileDiscoverable, loadNewestDiscoverableProfiles } from './lib/profileDiscovery';
import { loadGlobalStatisticsTotals } from './lib/statistics';

const HOMEPAGE_MIGRATION_IDS = [
  'homepage_factions_v1',
  'homepage_rulesets_v1',
  'homepage_members_v1',
] as const;
const PROFILE_DISCOVERY_MIGRATION_ID = 'profile_discovery_profiles_v1';

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

const spotlightsValidator = v.object({
  newArrival: v.union(spotlightValidator, v.null()),
  freshlyUpdated: v.union(spotlightValidator, v.null()),
});

const newestMembersValidator = v.array(
  v.object({
    id: v.id('profiles'),
    slug: v.string(),
    username: v.string(),
    avatarUrl: v.string(),
    createdAt: v.string(),
  })
);

/** Permanent homepage read composed from reusable domain boundaries. */
export const get = query({
  args: {},
  returns: v.object({
    spotlights: spotlightsValidator,
    community: v.object({
      counts: metricCountsValidator,
      newestMembers: newestMembersValidator,
    }),
  }),
  handler: async (ctx) => {
    const [spotlights, totals, newestMembers] = await Promise.all([
      loadFactionCatalogueSpotlightPreviews(ctx),
      loadGlobalStatisticsTotals(ctx),
      loadNewestDiscoverableProfiles(ctx, 4),
    ]);

    return {
      spotlights,
      community: {
        counts: {
          factions: totals.factions,
          rulesets: totals.rulesets,
          members: totals.users,
          questions: totals.questions,
          answers: totals.answers,
        },
        newestMembers,
      },
    };
  },
});

/** Compatibility read for the pre-cutover frontend. Remove with the legacy homepage aggregate. */
export const page = query({
  args: {},
  returns: v.object({
    spotlights: spotlightsValidator,
    community: v.object({
      counts: v.union(metricCountsValidator, v.null()),
      newestMembers: newestMembersValidator,
    }),
  }),
  handler: async (ctx) => {
    const [spotlights, profileDiscoveryRun, ...migrationRuns] = await Promise.all([
      loadFactionCatalogueSpotlightPreviews(ctx),
      ctx.db
        .query('migration_runs')
        .withIndex('by_migration_id', (q) => q.eq('migration_id', PROFILE_DISCOVERY_MIGRATION_ID))
        .unique(),
      ...HOMEPAGE_MIGRATION_IDS.map((id) =>
        ctx.db
          .query('migration_runs')
          .withIndex('by_migration_id', (q) => q.eq('migration_id', id))
          .unique()
      ),
    ]);

    const profileDiscoveryReady =
      profileDiscoveryRun?.is_done === true && profileDiscoveryRun.state === 'success';
    const newestMembers = profileDiscoveryReady
      ? await loadNewestDiscoverableProfiles(ctx, 4)
      : await loadHomepageNewestMemberIds(ctx).then(async (ids) => {
          const profiles = await Promise.all(ids.map((id) => ctx.db.get(id)));
          return profiles
            .filter((profile) => profile !== null && isProfileDiscoverable(profile))
            .map((profile) => ({
              id: profile._id,
              slug: profile.slug,
              username: profile.username,
              avatarUrl: profile.avatar_url,
              createdAt: profile.created_at,
            }));
        });

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
        newestMembers,
      },
    };
  },
});
