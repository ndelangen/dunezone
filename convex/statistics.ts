import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalQuery, query } from './_generated/server';
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

const reconciliationItemValidator = v.object({
  id: v.string(),
  included: v.boolean(),
  rulesetId: v.union(v.string(), v.null()),
  parentExists: v.boolean(),
});

const rebuildSourceValidator = v.union(
  v.literal('profiles'),
  v.literal('factions'),
  v.literal('rulesets'),
  v.literal('faq_items'),
  v.literal('faq_answers')
);

type RebuildSource = 'profiles' | 'factions' | 'rulesets' | 'faq_items' | 'faq_answers';

const REBUILD_SOURCES: RebuildSource[] = ['profiles', 'factions', 'rulesets', 'faq_items', 'faq_answers'];
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

/**
 * Bounded canonical projections used by the migration verification script.
 * This remains internal: clients only receive the clean numeric Statistics queries above.
 */
export const getCanonicalReconciliationPage = internalQuery({
  args: {
    source: rebuildSourceValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(reconciliationItemValidator),
  handler: async (ctx, args) => {
    switch (args.source) {
      case 'profiles': {
        const result = await ctx.db.query('profiles').paginate(args.paginationOpts);
        return {
          ...result,
          page: result.page.map((row) => ({
            id: row._id,
            included: true,
            rulesetId: null,
            parentExists: true,
          })),
        };
      }
      case 'factions': {
        const result = await ctx.db.query('factions').paginate(args.paginationOpts);
        return {
          ...result,
          page: result.page.map((row) => ({
            id: row._id,
            included: !row.is_deleted,
            rulesetId: null,
            parentExists: true,
          })),
        };
      }
      case 'rulesets': {
        const result = await ctx.db.query('rulesets').paginate(args.paginationOpts);
        return {
          ...result,
          page: result.page.map((row) => ({
            id: row._id,
            included: !row.is_deleted,
            rulesetId: row._id,
            parentExists: true,
          })),
        };
      }
      case 'faq_items': {
        const result = await ctx.db.query('faq_items').paginate(args.paginationOpts);
        return {
          ...result,
          page: await Promise.all(
            result.page.map(async (row) => ({
              id: row._id,
              included: true,
              rulesetId: row.ruleset_id,
              parentExists: (await ctx.db.get(row.ruleset_id)) !== null,
            }))
          ),
        };
      }
      case 'faq_answers': {
        const result = await ctx.db.query('faq_answers').paginate(args.paginationOpts);
        return {
          ...result,
          page: await Promise.all(
            result.page.map(async (row) => {
              const question = await ctx.db.get(row.faq_item_id);
              return {
                id: row._id,
                included: true,
                rulesetId: question?.ruleset_id ?? null,
                parentExists: question !== null,
              };
            })
          ),
        };
      }
    }
  },
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
