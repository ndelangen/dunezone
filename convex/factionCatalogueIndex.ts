/**
 * PROTOTYPE (approach B): the server-side Faction catalogue page.
 * Not used by any route yet.
 * See `convex/lib/factionCatalogueIndex.ts` for the read model and which argument combinations are exact.
 */
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, publicQuery } from './functions';
import { catalogueFactionValidator } from './lib/collaborativeAccessValidators';
import {
  backfillFactionCatalogueEntriesPage,
  loadCataloguePage,
  repairFactionCatalogueOrderPage,
} from './lib/factionCatalogueIndex';

const sortValidator = v.union(
  v.literal('name'),
  v.literal('created'),
  v.literal('updated'),
  v.literal('complexity'),
  v.literal('relevance')
);

export const page = publicQuery({
  args: {
    q: v.optional(v.string()),
    ruleset: v.optional(v.id('rulesets')),
    complexityMin: v.optional(v.number()),
    complexityMax: v.optional(v.number()),
    sort: sortValidator,
    direction: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    page: v.number(),
  },
  returns: v.object({
    items: v.array(catalogueFactionValidator),
    page: v.number(),
    total: v.number(),
    pageCount: v.number(),
    mode: v.union(
      v.literal('aggregate'),
      v.literal('aggregate-bounded'),
      v.literal('in-memory'),
      v.literal('filtered-scan'),
      v.literal('search')
    ),
    exact: v.boolean(),
  }),
  handler: async (ctx, args) => await loadCataloguePage(ctx, args),
});

const REBUILD_BATCH = 100;

/** Backfill or repair: resync every faction's entries, then re-insert every entry's aggregate items. Self-scheduling. */
export const rebuild = internalMutation({
  args: {
    phase: v.union(v.literal('entries'), v.literal('order')),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const step =
      args.phase === 'entries'
        ? await backfillFactionCatalogueEntriesPage(ctx, args.cursor, REBUILD_BATCH)
        : await repairFactionCatalogueOrderPage(ctx, args.cursor, REBUILD_BATCH);
    if (!step.isDone) {
      await ctx.scheduler.runAfter(0, internal.factionCatalogueIndex.rebuild, {
        phase: args.phase,
        cursor: step.cursor,
      });
    } else if (args.phase === 'entries') {
      await ctx.scheduler.runAfter(0, internal.factionCatalogueIndex.rebuild, { phase: 'order', cursor: null });
    }
    return null;
  },
});
