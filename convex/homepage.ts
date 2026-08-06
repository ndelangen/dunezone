import { v } from 'convex/values';

import { query } from './_generated/server';
import { loadFactionCatalogueSpotlightPreviews } from './lib/factionCatalogue';
import { factionDataValidator } from './lib/factionData';
import { loadNewestDiscoverableProfiles } from './lib/profileDiscovery';
import { loadGlobalStatisticsTotals } from './lib/statistics';

const spotlightValidator = v.object({
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  data: factionDataValidator.pick('name', 'logo', 'background'),
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
