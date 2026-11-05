import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { rulebookResolvedAssetSchema } from '../src/shared/rulebooks/sources';
import { publicQuery } from './functions';
import { resolveRulebookAsset } from './lib/rulebookReferences';

/**
 * The saved Arrakis board, for pages that show Arrakis without a game board of their own: the homepage, the glossary and the tutorial.
 * It carries the published image, its territories' geometry and the board's own data, the same way a Rulebook draws a saved board.
 */
export const board = publicQuery({
  args: {},
  returns: v.union(v.null(), zodToConvex(rulebookResolvedAssetSchema)),
  handler: async (ctx) => {
    const row = await ctx.db
      .query('assets')
      .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
      .unique();
    return row && !row.is_deleted ? await resolveRulebookAsset(ctx, row._id, true) : null;
  },
});
