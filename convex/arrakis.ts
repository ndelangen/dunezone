import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { BoardAsset, BoardDefinition } from '../src/shared/boards/schema';
import { publicQuery } from './functions';
import { resolveRulebookAsset } from './lib/rulebookReferences';
import type { QueryCtx } from './types';

/**
 * The saved Arrakis board's live row and its published face.
 * The face is the last publication, so republishing the board does not hide it.
 * `null` without a live board, or before its first publication with territories.
 */
async function savedArrakisFace(ctx: QueryCtx) {
  /* A slug names one live asset, but a deleted one can keep it; the live one is taken. */
  const rows = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
    .take(8);
  const row = rows.find((candidate) => !candidate.is_deleted);
  const face = row ? await resolveRulebookAsset(ctx, row._id, false) : null;
  return row && face?.imageUrl && face.geometry
    ? { row, assetId: face.assetId, name: face.name, imageUrl: face.imageUrl, geometry: face.geometry }
    : null;
}

/**
 * The saved Arrakis board, for pages that show Arrakis without a game board of their own: the homepage and tutorial tables play on it, the glossary teaches on it, and a new Rulebook scene starts on it.
 */
export const board = publicQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      assetId: v.string(),
      name: v.string(),
      imageUrl: v.string(),
      geometry: zodToConvex(componentGeometrySchema),
      board: zodToConvex(BoardDefinition),
    })
  ),
  /* The board data is the saved row's own, so a republish in progress does not hide it either. */
  handler: async (ctx) => {
    const face = await savedArrakisFace(ctx);
    const data = BoardAsset.safeParse(face?.row.data);
    return face && data.success
      ? {
          assetId: face.assetId,
          name: face.name,
          imageUrl: face.imageUrl,
          geometry: face.geometry,
          board: data.data.board,
        }
      : null;
  },
});

/**
 * The saved Arrakis board's id and published face only, for a new Rulebook scene, which needs no board data.
 * Bundles from before `board` also read it.
 */
export const face = publicQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ assetId: v.string(), imageUrl: v.string(), geometry: zodToConvex(componentGeometrySchema) })
  ),
  handler: async (ctx) => {
    /* The face does not need board data that passes the board schema. */
    const found = await savedArrakisFace(ctx);
    return found && { assetId: found.assetId, imageUrl: found.imageUrl, geometry: found.geometry };
  },
});
