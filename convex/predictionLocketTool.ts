import { v } from 'convex/values';

import { mutation } from './functions';

/*
 * The prediction locket tool keeps the prediction on the phone; Dune Zone never sees it (Norbert, 2026-11-09).
 * All the server gives is the time, from its own clock, so the time the phone shows as "locked" is not the phone's own clock.
 * A mutation rather than a query: a query's answer is cached and shared, and the time has to be the time of this call.
 */
export const lockTime = mutation({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});
