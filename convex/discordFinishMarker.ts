import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';

const marker = v.object({ id: v.id('play_game_discord_channels'), endedAt: v.number() });

async function retireMarker(ctx: MutationCtx, { id, endedAt }: Infer<typeof marker>) {
  const row = await ctx.db.get(id);
  if (row?.state !== 'deleted') {
    throw new Error('Expected a deleted Discord channel record.');
  }
  if (row.ended_at === undefined) {
    return;
  }
  if (row.ended_at !== endedAt) {
    throw new Error('A Discord channel marker changed since verification.');
  }
  await ctx.db.patch(id, { ended_at: undefined });
}

export const retire = internalMutation({
  args: { rows: v.array(marker) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    if (rows.length !== 2 || new Set(rows.map(({ id }) => id)).size !== rows.length) {
      throw new Error('Expected two distinct Discord channel records.');
    }
    for (const row of rows) {
      await retireMarker(ctx, row);
    }
    return null;
  },
});
