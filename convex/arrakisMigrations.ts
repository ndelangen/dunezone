import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { SPICE_CARD_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { SpiceAsset } from '../src/shared/assets/schema';
import type { BoardTint } from '../src/shared/boards/markup';
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
 * Spice cards without a board link get one, their highlights carried as one tint;
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

/* Every territory and type a tint list covers, to tell whether a card's old highlights are already drawn by its tints. */
function covers(tints: readonly BoardTint[], tint: BoardTint) {
  const territories = new Set(tints.flatMap((each) => each.territories));
  const types = new Set(tints.flatMap((each) => each.types ?? []));
  return tint.territories.every((id) => territories.has(id)) && (tint.types ?? []).every((type) => types.has(type));
}

/**
 * A Spice card's data on the saved board: linked if it was not, its old highlight list emptied once its tints draw it.
 * Only those two fields change;
 * the rest is kept exactly as stored, so a parse's defaults never reach the row.
 * A row that no longer parses, or a linked card whose tints do not cover its old highlights, is left as it is for the verify to name.
 */
export function spiceCardOnBoard(data: unknown, boardId: string): unknown {
  const parsed = SpiceAsset.safeParse(data);
  if (!parsed.success || (parsed.data.highlights.length === 0 && parsed.data.board)) {
    return data;
  }
  const card = parsed.data;
  const stored = data as Record<string, unknown>;
  const carried = legacyHighlightTint(card.highlights, card.subName);
  if (card.board) {
    return !carried || covers(card.board.tints, carried) ? { ...stored, highlights: [] } : data;
  }
  return { ...stored, highlights: [], board: { asset_id: boardId, tints: carried ? [carried] : [], tokens: [] } };
}

/** Whether a Spice card still needs moving: no board link, or an old highlight list left on it. */
export function spiceCardNeedsMove(data: unknown) {
  const card = data as { board?: unknown; highlights?: unknown };
  return !card.board || (Array.isArray(card.highlights) && card.highlights.length > 0);
}

/* A highlight on the built-in board named a territory no board has; Norbert confirmed it meant The Greater Flat (#1971). */
const MISSPELT_TERRITORIES: Record<string, string> = { 'greater-flat': 'the-greater-flat' };

type Entry = [key: string, item: unknown];

const misspeltTerritory = ([key, item]: Entry) =>
  key === 'territory' && typeof item === 'string' ? MISSPELT_TERRITORIES[item] : undefined;

function renamed(entry: Entry, boardId: string): unknown {
  if (entry[0] === 'boardId' && entry[1] === BUILT_IN_ARRAKIS_BOARD_ID) {
    return boardId;
  }
  return misspeltTerritory(entry) ?? contentsOnBoard(entry[1], boardId);
}

/** Rulebook Contents with every board reference to the built-in Arrakis board renamed to the saved board's id, and its one misspelt territory corrected. */
export function contentsOnBoard(value: unknown, boardId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => contentsOnBoard(item, boardId));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map((entry) => [entry[0], renamed(entry, boardId)]));
  }
  return value;
}

/** Whether Contents still name the built-in board or a misspelt territory. */
export function namesOldBoardKeys(contents: unknown) {
  const text = JSON.stringify(contents);
  return (
    text.includes(`"boardId":"${BUILT_IN_ARRAKIS_BOARD_ID}"`) ||
    Object.keys(MISSPELT_TERRITORIES).some((territory) => text.includes(`"territory":"${territory}"`))
  );
}

/** Links every Spice card to the saved board and empties its old highlight list; a changed card indexes its board and is captured again. */
export const arrakis_spice_cards_v1 = migrations.define({
  table: 'assets',
  batchSize: 25,
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: async (ctx, row) => {
    const boardId = spiceCardNeedsMove(row.data) ? await arrakisBoardId(ctx) : null;
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

/** Contents that still name the built-in board, moved onto the saved board; null when there is nothing to move or no saved board. */
async function movedContents(ctx: MutationCtx, contents: unknown) {
  const boardId = namesOldBoardKeys(contents) ? await arrakisBoardId(ctx) : null;
  return boardId ? contentsOnBoard(contents, boardId) : null;
}

/** Renames the built-in board in a draft's Contents and rebuilds its Contents hash; the settings-and-Contents hash is dropped, as the emblem rename did. */
export const arrakis_rulebook_drafts_v1 = migrations.define({
  table: 'rulebook_drafts',
  batchSize: 2,
  migrateOne: async (ctx, draft) => {
    const contents = await movedContents(ctx, draft.contents);
    return contents
      ? { contents, contents_hash: rulebookDraftContentsHash(contents), authored_hash: undefined }
      : undefined;
  },
});

/** Renames the built-in board in an Edition's Contents and the hashes its metadata row keeps; its published files stay as they are. */
export const arrakis_rulebook_edition_contents_v1 = migrations.define({
  table: 'rulebook_edition_contents',
  batchSize: 2,
  migrateOne: async (ctx, row) => {
    const contents = await movedContents(ctx, row.contents);
    if (!contents) {
      return;
    }
    await ctx.db.patch(row.edition_id, {
      contents_hash: rulebookEditionContentsHash(contents),
      authored_hash: undefined,
    });
    return { contents };
  },
});

/**
 * Fails on the first row still on the built-in board, naming it, so the deploy cannot report the move done early.
 * A deployment without the saved board has nothing to move to, so it passes there;
 * production has it.
 */
export const arrakis_spice_cards_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 50,
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: async (ctx, row) => {
    if (!row.is_deleted && spiceCardNeedsMove(row.data) && (await arrakisBoardId(ctx))) {
      throw new Error(`card-spice ${row._id} is still on the built-in Arrakis map.`);
    }
  },
});

function verifyContents<Table extends 'rulebook_drafts' | 'rulebook_edition_contents'>(table: Table) {
  return migrations.define({
    table,
    batchSize: 2,
    migrateOne: async (ctx, row) => {
      if (namesOldBoardKeys(row.contents) && (await arrakisBoardId(ctx))) {
        throw new Error(`${table} ${row._id} still names the built-in Arrakis board.`);
      }
    },
  });
}

export const arrakis_rulebook_drafts_verify_v1 = verifyContents('rulebook_drafts');
export const arrakis_rulebook_edition_contents_verify_v1 = verifyContents('rulebook_edition_contents');

/**
 * This module's migrations under their ids, spread into `MIGRATION_IDS` so the deploy and the guard script run them like any other.
 * Typed by hand, as `EMBLEM_MIGRATION_IDS` is, so the generated api does not reference itself.
 */
export const ARRAKIS_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  arrakis_spice_cards_v1: internal.arrakisMigrations.arrakis_spice_cards_v1,
  arrakis_rulebook_drafts_v1: internal.arrakisMigrations.arrakis_rulebook_drafts_v1,
  arrakis_rulebook_edition_contents_v1: internal.arrakisMigrations.arrakis_rulebook_edition_contents_v1,
  arrakis_spice_cards_verify_v1: internal.arrakisMigrations.arrakis_spice_cards_verify_v1,
  arrakis_rulebook_drafts_verify_v1: internal.arrakisMigrations.arrakis_rulebook_drafts_verify_v1,
  arrakis_rulebook_edition_contents_verify_v1: internal.arrakisMigrations.arrakis_rulebook_edition_contents_verify_v1,
};
