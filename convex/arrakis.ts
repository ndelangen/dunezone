import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { BoardDefinition } from '../src/shared/boards/schema';
import { publicQuery } from './functions';
import { resolveRulebookAsset } from './lib/rulebookReferences';
import type { QueryCtx } from './types';

/**
 * The saved Arrakis board, for pages that show Arrakis without a game board of their own: the homepage and tutorial tables play on it, the glossary teaches on its face, and a new Rulebook scene starts on it.
 * It carries the published image, the territories that image shows, and the board's own data.
 * `null` while the site has none, or it has not been published with its territories yet.
 */
/** The saved Arrakis board's live row, resolved with its board data; `null` without one, or with no publication or territories yet. */
async function savedArrakis(ctx: QueryCtx) {
  /* A slug names one live asset, but a deleted one can keep it; the live one is taken. */
  const rows = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
    .take(8);
  const row = rows.find((candidate) => !candidate.is_deleted);
  const found = row ? await resolveRulebookAsset(ctx, row._id, true) : null;
  const definition = BoardDefinition.safeParse(found?.board);
  return found?.imageUrl && found.geometry && definition.success
    ? {
        assetId: found.assetId,
        name: found.name,
        imageUrl: found.imageUrl,
        geometry: found.geometry,
        board: definition.data,
      }
    : null;
}

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
  handler: async (ctx) => await savedArrakis(ctx),
});

/**
 * The saved Arrakis board's face only, as the bundle before `board` asked for it.
 * Kept so pages still running that bundle keep working through the deploy (AGENTS.md, expand/contract);
 * delete it in a later release.
 */
export const face = publicQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ assetId: v.string(), imageUrl: v.string(), geometry: zodToConvex(componentGeometrySchema) })
  ),
  handler: async (ctx) => {
    const found = await savedArrakis(ctx);
    return found && { assetId: found.assetId, imageUrl: found.imageUrl, geometry: found.geometry };
  },
});
