import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { BoardAsset, BoardDefinition } from '../src/shared/boards/schema';
import { publicQuery } from './functions';
import { resolveLoadedRulebookAsset } from './lib/rulebookReferences';
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
  const face = row ? await resolveLoadedRulebookAsset(ctx, row, false) : null;
  return row && face?.imageUrl && face.geometry
    ? {
        row,
        assetId: face.assetId,
        name: face.name,
        imageUrl: face.imageUrl,
        geometry: face.geometry,
        publicationToken: face.publicationRevision!,
      }
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
      revision: v.string(),
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
          revision: await arrakisRevision(ctx, face.assetId, face.publicationToken, face.row.updated_at),
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

/**
 * Names one version of `board`'s answer: its publication token (a republish), its saved row's `updated_at` (a save), and whether capture work is open for it, which can withhold a board published before geometry was stored with it.
 * The answer can be cached under the name.
 */
async function arrakisRevision(ctx: QueryCtx, assetId: string, publicationToken: string, updatedAt: string) {
  const capture = await ctx.db
    .query('publication_job_listings')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', assetId))
    .first();
  return `${publicationToken}.${updatedAt}${capture ? '.capturing' : ''}`;
}

/**
 * The saved Arrakis board's id, name and revision, from its small `board_readiness` row alone.
 * Pages subscribe to this and fetch `board`'s answer for that revision from the edge (`/data/arrakis-board/<revision>.json`), so Convex reads the board and its geometry once per revision and edge location instead of once per visit.
 * `null` when the site has no live saved Arrakis or it has never been published.
 */
export const reference = publicQuery({
  args: {},
  returns: v.union(v.null(), v.object({ assetId: v.string(), name: v.string(), revision: v.string() })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('board_readiness')
      .withIndex('by_slug_and_deleted', (q) => q.eq('slug', ARRAKIS_BOARD_SLUG).eq('is_deleted', false))
      .take(2);
    const row = rows[0];
    if (!row) {
      return null;
    }
    const assetId: string = row.asset_id;
    /* A row written before it carried the token falls back to the publication row, which is larger for the geometry it holds. */
    const token =
      row.publication_token ??
      (
        await ctx.db
          .query('publication_assets')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', assetId))
          .unique()
      )?.cache_token;
    return token
      ? { assetId, name: row.name, revision: await arrakisRevision(ctx, assetId, token, row.updated_at) }
      : null;
  },
});
