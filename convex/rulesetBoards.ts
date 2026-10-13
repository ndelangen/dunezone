import { v } from 'convex/values';

import { parseBoardData } from '../src/shared/assets/validation';
import { internalMutation } from './functions';

/** An explicitly authorized backfill fills only absent board slots, never replacing an authored selection. */
export const fillMissing = internalMutation({
  args: { boardId: v.id('assets'), cursor: v.union(v.string(), v.null()), dryRun: v.boolean() },
  returns: v.object({
    cursor: v.string(),
    done: v.boolean(),
    linked: v.array(v.id('rulesets')),
    links: v.array(v.id('ruleset_asset_slots')),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const board = await ctx.db.get('assets', args.boardId);
    if (!board || board.is_deleted || board.type !== 'board') {
      throw new Error('Choose an available board');
    }
    parseBoardData(board.data);
    const page = await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .paginate({ cursor: args.cursor, numItems: 25 });
    const linked = [],
      links = [];
    let skipped = 0;
    for (const ruleset of page.page) {
      const existing = await ctx.db
        .query('ruleset_asset_slots')
        .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ruleset._id).eq('slot', 'board'))
        .first();
      if (existing) {
        skipped++;
        continue;
      }
      linked.push(ruleset._id);
      if (!args.dryRun) {
        links.push(
          await ctx.db.insert('ruleset_asset_slots', { ruleset_id: ruleset._id, asset_id: args.boardId, slot: 'board' })
        );
      }
    }
    return { cursor: page.continueCursor, done: page.isDone, linked, links, skipped };
  },
});
