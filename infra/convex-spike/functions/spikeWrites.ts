/**
 * Spike-only functions for #2078, copied into a scratch copy of convex/ at deploy time and never into the app.
 * The write-loss client logs every `n` that `add` acknowledged, then asks `missing` which of them survived a restart.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const add = mutation({
  args: { n: v.number(), client: v.string() },
  returns: v.number(),
  handler: async (ctx, { n, client }) => {
    await ctx.db.insert('spike_writes', { n, client });
    return n;
  },
});

export const missing = query({
  args: { ns: v.array(v.number()) },
  returns: v.array(v.number()),
  handler: async (ctx, { ns }) => {
    const absent: number[] = [];
    for (const n of ns) {
      const row = await ctx.db
        .query('spike_writes')
        .withIndex('by_n', (q) => q.eq('n', n))
        .first();
      if (!row) {
        absent.push(n);
      }
    }
    return absent;
  },
});

export const latest = query({
  args: {},
  returns: v.union(v.object({ n: v.number(), client: v.string() }), v.null()),
  handler: async (ctx) => {
    const row = await ctx.db.query('spike_writes').order('desc').first();
    return row ? { n: row.n, client: row.client } : null;
  },
});

/** Rewrites one faction's updated_at so the next catalogue query misses Convex's query cache. */
export const touchFaction = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const faction = await ctx.db.query('factions').first();
    if (faction) {
      await ctx.db.patch(faction._id, { updated_at: new Date().toISOString() });
    }
    return null;
  },
});
