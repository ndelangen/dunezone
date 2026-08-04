import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { query } from './_generated/server';
import { internalMutation } from './functions';
import {
  clearStatistics,
  loadGlobalStatisticsTotals,
  loadRulesetStatisticsTotals,
  reconcileAnswerStatistics,
  reconcileFactionStatistics,
  reconcileProfileStatistics,
  reconcileQuestionStatistics,
  reconcileRulesetStatistics,
} from './lib/statistics';

const globalTotalsValidator = v.object({
  users: v.number(),
  factions: v.number(),
  rulesets: v.number(),
  questions: v.number(),
  answers: v.number(),
});

const rulesetTotalsValidator = v.object({
  questions: v.number(),
  answers: v.number(),
});

const rebuildSourceValidator = v.union(
  v.literal('profiles'),
  v.literal('factions'),
  v.literal('rulesets'),
  v.literal('faq_items'),
  v.literal('faq_answers')
);

type RebuildSource = 'profiles' | 'factions' | 'rulesets' | 'faq_items' | 'faq_answers';

const REBUILD_SOURCES: RebuildSource[] = [
  'profiles',
  'factions',
  'rulesets',
  'faq_items',
  'faq_answers',
];
const REBUILD_BATCH_SIZE = 64;

export const getGlobalTotals = query({
  args: {},
  returns: globalTotalsValidator,
  handler: async (ctx) => await loadGlobalStatisticsTotals(ctx),
});

export const getRulesetTotals = query({
  args: { rulesetId: v.id('rulesets') },
  returns: rulesetTotalsValidator,
  handler: async (ctx, args) => await loadRulesetStatisticsTotals(ctx, args.rulesetId),
});

export const rebuild = internalMutation({
  args: {},
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx): Promise<{ scheduled: boolean }> => {
    await clearStatistics(ctx);
    await ctx.scheduler.runAfter(0, internal.statistics.rebuildBatch, {
      source: REBUILD_SOURCES[0],
      paginationOpts: { cursor: null, numItems: REBUILD_BATCH_SIZE },
    });
    return { scheduled: true };
  },
});

export const rebuildBatch = internalMutation({
  args: {
    source: rebuildSourceValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    source: rebuildSourceValidator,
    processed: v.number(),
    complete: v.boolean(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    source: RebuildSource;
    processed: number;
    complete: boolean;
  }> => {
    let processed = 0;
    let isDone = false;
    let continueCursor = args.paginationOpts.cursor;

    switch (args.source) {
      case 'profiles': {
        const result = await ctx.db.query('profiles').paginate(args.paginationOpts);
        for (const row of result.page) {
          await reconcileProfileStatistics(ctx, row);
        }
        processed = result.page.length;
        isDone = result.isDone;
        continueCursor = result.continueCursor;
        break;
      }
      case 'factions': {
        const result = await ctx.db.query('factions').paginate(args.paginationOpts);
        for (const row of result.page) {
          await reconcileFactionStatistics(ctx, row);
        }
        processed = result.page.length;
        isDone = result.isDone;
        continueCursor = result.continueCursor;
        break;
      }
      case 'rulesets': {
        const result = await ctx.db.query('rulesets').paginate(args.paginationOpts);
        for (const row of result.page) {
          await reconcileRulesetStatistics(ctx, row);
        }
        processed = result.page.length;
        isDone = result.isDone;
        continueCursor = result.continueCursor;
        break;
      }
      case 'faq_items': {
        const result = await ctx.db.query('faq_items').paginate(args.paginationOpts);
        for (const row of result.page) {
          await reconcileQuestionStatistics(ctx, row);
        }
        processed = result.page.length;
        isDone = result.isDone;
        continueCursor = result.continueCursor;
        break;
      }
      case 'faq_answers': {
        const result = await ctx.db.query('faq_answers').paginate(args.paginationOpts);
        for (const row of result.page) {
          await reconcileAnswerStatistics(ctx, row);
        }
        processed = result.page.length;
        isDone = result.isDone;
        continueCursor = result.continueCursor;
        break;
      }
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.statistics.rebuildBatch, {
        source: args.source,
        paginationOpts: { ...args.paginationOpts, cursor: continueCursor },
      });
      return { source: args.source, processed, complete: false };
    }

    const sourceIndex = REBUILD_SOURCES.indexOf(args.source);
    const nextSource = REBUILD_SOURCES[sourceIndex + 1];
    if (nextSource) {
      await ctx.scheduler.runAfter(0, internal.statistics.rebuildBatch, {
        source: nextSource,
        paginationOpts: { cursor: null, numItems: REBUILD_BATCH_SIZE },
      });
      return { source: args.source, processed, complete: false };
    }

    return { source: args.source, processed, complete: true };
  },
});
