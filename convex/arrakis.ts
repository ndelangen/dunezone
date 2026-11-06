import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { publicQuery } from './functions';
import { resolveRulebookAsset } from './lib/rulebookReferences';

/**
 * The saved Arrakis board's published face: its id, image and the territories that image shows.
 * The glossary teaches on it and a new Rulebook scene starts on it;
 * tables play on the bundled preset instead, so the board's own data is not sent.
 * `null` while the site has none, or it has not been published with its territories yet.
 */
export const face = publicQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ assetId: v.string(), imageUrl: v.string(), geometry: zodToConvex(componentGeometrySchema) })
  ),
  handler: async (ctx) => {
    /* A slug names one live asset, but a deleted one can keep it; the live one is taken. */
    const rows = await ctx.db
      .query('assets')
      .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
      .take(8);
    const row = rows.find((candidate) => !candidate.is_deleted);
    const board = row ? await resolveRulebookAsset(ctx, row._id, false) : null;
    return board?.imageUrl && board.geometry
      ? { assetId: board.assetId, imageUrl: board.imageUrl, geometry: board.geometry }
      : null;
  },
});
