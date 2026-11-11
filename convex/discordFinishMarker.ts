import { v } from 'convex/values';

import { internalMutation } from './functions';

export const retire = internalMutation({
  args: { rows: v.array(v.object({ id: v.id('play_game_discord_channels'), endedAt: v.number() })) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    if (rows.length !== 2 || new Set(rows.map(({ id }) => id)).size !== rows.length) {
      throw new Error('Expected two distinct Discord channel records.');
    }
    for (const { id, endedAt } of rows) {
      const row = await ctx.db.get(id);
      if (row?.state !== 'deleted' || (row.ended_at !== undefined && row.ended_at !== endedAt)) {
        throw new Error('A Discord channel record changed since verification.');
      }
      if (row.ended_at !== undefined) {
        await ctx.db.patch(id, { ended_at: undefined });
      }
    }
    return null;
  },
});
