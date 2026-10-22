import { v } from 'convex/values';

import { normalizePlayGameSlug, inspectPlayGameName } from '../src/shared/play/gameNamePolicy';
import { currentPlaySession } from './lib/playAuthorization';
import { playGameAddressAvailable } from './lib/playGameAddressAvailability';
import { viewerQuery } from './queryAudience';
/** The creation hint loads naming and session reads without allocating a game. */
export const nameAvailability = viewerQuery({
  args: { name: v.string() },
  returns: v.union(v.null(), v.object({ base: v.string(), duplicate: v.boolean() })),
  handler: async (ctx, { name }) => {
    if (!(await currentPlaySession(ctx))) {
      return null;
    }
    const parsed = inspectPlayGameName(name);
    if (parsed.issues.length) {
      return null;
    }
    const base = normalizePlayGameSlug(parsed.name);
    return { base, duplicate: !(await playGameAddressAvailable(ctx, base)) };
  },
});
