import { v } from 'convex/values';

import { internal } from './_generated/api';
import { query } from './_generated/server';
import { internalMutation } from './functions';
import { slugify } from './lib/utils';

/**
 * Template for bounded, resumable backfills.
 *
 * Copy this file into a real migration module (for example `convex/migrations.ts`) and replace table/field/function names.
 */

export const startBackfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.migrationsTemplate.runBackfillBatch, {
      cursor: null,
      processed: 0,
    });
    return { started: true };
  },
});

export const runBackfillBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    processed: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('groups').paginate({ numItems: 100, cursor: args.cursor });

    let updated = 0;
    for (const row of page.page) {
      const slug = (row as { slug?: string }).slug;
      // Example condition. Replace with migration-specific logic.
      if (slug === undefined) {
        // Example: slugify and suffix for uniqueness.
        const baseSlug = slugify(row.name) || 'group';
        let nextSlug = baseSlug;
        let suffix = 1;

        while (true) {
          const existing = await ctx.db
            .query('groups')
            .withIndex('by_slug', (q) => q.eq('slug', nextSlug))
            .unique();
          if (!existing || existing._id === row._id) {
            break;
          }
          suffix += 1;
          nextSlug = `${baseSlug}-${suffix}`;
        }

        await ctx.db.patch(row._id, { slug: nextSlug });
        updated += 1;
      }
    }

    const processed = args.processed + page.page.length;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrationsTemplate.runBackfillBatch, {
        cursor: page.continueCursor,
        processed,
      });
    }

    return { processed, updated, done: page.isDone };
  },
});

export const verifyBackfill = query({
  args: {},
  handler: async (ctx) => {
    const sample = await ctx.db.query('groups').take(200);
    const remaining = sample.filter((row) => (row as { slug?: string }).slug === undefined).length;

    return {
      remainingInSample: remaining,
      sampleSize: sample.length,
      complete: remaining === 0 && sample.length < 200,
    };
  },
});
