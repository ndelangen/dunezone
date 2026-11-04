import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { SPICE_CARD_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { SpiceAsset } from '../src/shared/assets/schema';
import { legacyHighlightTint } from '../src/shared/boards/spiceHighlights';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { enqueueAssetPublication, supersedePendingPublication } from './lib/publication';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import { syncSpiceCardRelations } from './lib/spiceCardBoard';
import schema from './schema';

/*
 * Moves the last consumers of the built-in Arrakis map onto the saved Arrakis board (#1971).
 * Spice cards without a board link get one, their highlights carried as one tint; Rulesets without a board get it;
 * Rulebook Contents that name the built-in board by its "arrakis" id name the saved board instead.
 * A deployment without the saved board changes nothing. A second pass finds nothing to change, so each is safe to replay.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'arrakisMigrations:',
  schema,
});

/** The saved Arrakis board's slug: the stock board every built-in Arrakis reference moves to. */
export const ARRAKIS_BOARD_SLUG = 'arrakis-official';

/** The id Rulebook Contents gave the built-in Arrakis board. */
export const BUILT_IN_ARRAKIS_BOARD_ID = 'arrakis';

async function arrakisBoardId(ctx: MutationCtx): Promise<Id<'assets'> | null> {
  const board = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
    .unique();
  return board && !board.is_deleted ? board._id : null;
}

/** A Spice card's data on the saved board: linked if it was not, its old highlight list emptied either way. */
export function spiceCardOnBoard(data: unknown, boardId: string): unknown {
  const card = SpiceAsset.parse(data);
  if (card.board && card.highlights.length === 0) {
    return data;
  }
  if (card.board) {
    return { ...card, highlights: [] };
  }
  const carried = legacyHighlightTint(card.highlights, card.subName);
  return { ...card, highlights: [], board: { asset_id: boardId, tints: carried ? [carried] : [], tokens: [] } };
}

/** Rulebook Contents with every board reference to the built-in Arrakis board renamed to the saved board's id. */
export function contentsOnBoard(value: unknown, boardId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => contentsOnBoard(item, boardId));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'boardId' && item === BUILT_IN_ARRAKIS_BOARD_ID ? boardId : contentsOnBoard(item, boardId),
      ])
    );
  }
  return value;
}

const namesBuiltInBoard = (contents: unknown) =>
  JSON.stringify(contents).includes(`"boardId":"${BUILT_IN_ARRAKIS_BOARD_ID}"`);

/** Links every Spice card to the saved board and empties its old highlight list; a changed card indexes its board and is captured again. */
export const arrakis_spice_cards_v1 = migrations.define({
  table: 'assets',
  batchSize: 25,
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: async (ctx, row) => {
    const boardId = await arrakisBoardId(ctx);
    if (!boardId) {
      return;
    }
    const data = spiceCardOnBoard(row.data, boardId);
    if (data === row.data) {
      return;
    }
    await syncSpiceCardRelations(ctx, row._id, data);
    if (!row.is_deleted) {
      await supersedePendingPublication(ctx, row.type, row._id);
      await enqueueAssetPublication(ctx, { _id: row._id, type: row.type, slug: row.slug, data });
    }
    return { data };
  },
});

/** Gives every live Ruleset without a board the saved Arrakis board, as its board slot. */
export const arrakis_ruleset_boards_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 25,
  migrateOne: async (ctx, ruleset) => {
    if (ruleset.is_deleted) {
      return;
    }
    const boardId = await arrakisBoardId(ctx);
    const existing = await ctx.db
      .query('ruleset_asset_slots')
      .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ruleset._id).eq('slot', 'board'))
      .first();
    if (boardId && !existing) {
      await ctx.db.insert('ruleset_asset_slots', { ruleset_id: ruleset._id, asset_id: boardId, slot: 'board' });
    }
  },
});

/** Renames the built-in board in a draft's Contents and rebuilds its Contents hash; the settings-and-Contents hash is dropped, as the emblem rename did. */
export const arrakis_rulebook_drafts_v1 = migrations.define({
  table: 'rulebook_drafts',
  batchSize: 2,
  migrateOne: async (ctx, draft) => {
    const boardId = namesBuiltInBoard(draft.contents) ? await arrakisBoardId(ctx) : null;
    if (!boardId) {
      return;
    }
    const contents = contentsOnBoard(draft.contents, boardId);
    return { contents, contents_hash: rulebookDraftContentsHash(contents), authored_hash: undefined };
  },
});

/** Renames the built-in board in an Edition's Contents and the hashes its metadata row keeps; its published files stay as they are. */
export const arrakis_rulebook_edition_contents_v1 = migrations.define({
  table: 'rulebook_edition_contents',
  batchSize: 2,
  migrateOne: async (ctx, row) => {
    const boardId = namesBuiltInBoard(row.contents) ? await arrakisBoardId(ctx) : null;
    if (!boardId) {
      return;
    }
    const contents = contentsOnBoard(row.contents, boardId);
    await ctx.db.patch(row.edition_id, {
      contents_hash: rulebookEditionContentsHash(contents),
      authored_hash: undefined,
    });
    return { contents };
  },
});

/**
 * This module's migrations under their ids, spread into `MIGRATION_IDS` so the deploy and the guard script run them like any other.
 * Typed by hand, as `EMBLEM_MIGRATION_IDS` is, so the generated api does not reference itself.
 */
export const ARRAKIS_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  arrakis_spice_cards_v1: internal.arrakisMigrations.arrakis_spice_cards_v1,
  arrakis_ruleset_boards_v1: internal.arrakisMigrations.arrakis_ruleset_boards_v1,
  arrakis_rulebook_drafts_v1: internal.arrakisMigrations.arrakis_rulebook_drafts_v1,
  arrakis_rulebook_edition_contents_v1: internal.arrakisMigrations.arrakis_rulebook_edition_contents_v1,
};
