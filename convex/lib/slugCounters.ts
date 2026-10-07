import { ConvexError } from 'convex/values';

import type { MutationCtx } from '../_generated/server';
import { selectSlug } from './slugAllocation';

/** Existing counters store the last consumed ordinal, including the asset counters created before base 36. */
export async function allocateCounterSlug(
  ctx: MutationCtx,
  key: string,
  base: string,
  available: (slug: string) => Promise<boolean>
) {
  const counter = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  const selection = await selectSlug({ base, nextSuffix: (counter?.value ?? 0) + 1, available });
  if (!selection) {
    throw new ConvexError('Could not assign a unique URL. Please save again.');
  }
  if (selection.nextSuffix !== null) {
    const value = selection.nextSuffix - 1;
    if (counter) {
      await ctx.db.patch(counter._id, { value });
    } else {
      await ctx.db.insert('counters', { key, value });
    }
  }
  return selection.slug;
}
