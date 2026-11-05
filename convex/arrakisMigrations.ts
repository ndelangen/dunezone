import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { SPICE_CARD_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { SpiceAsset } from '../src/shared/assets/schema';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import type { Board } from '../src/shared/boards/geometry';
import type { BoardTint } from '../src/shared/boards/markup';
import { propertyId } from '../src/shared/boards/schema';
import { legacyHighlightTint } from '../src/shared/boards/spiceHighlights';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { enqueueAssetPublication, publicationScanBatchSize, supersedePendingPublication } from './lib/publication';
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

/** The id Rulebook Contents gave the built-in Arrakis board. */
export const BUILT_IN_ARRAKIS_BOARD_ID = 'arrakis';

/** The saved Arrakis board a card moves onto: its asset id, and its territories to resolve a tint's types against. */
export type SavedBoard = { id: Id<'assets'>; properties: Board['properties'] };

const savedBoard = (row: Doc<'assets'>): SavedBoard => ({
  id: row._id,
  properties: (row.data as { board?: Partial<Board> }).board?.properties ?? {},
});

async function arrakisBoard(ctx: MutationCtx): Promise<SavedBoard | null> {
  const board = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
    .unique();
  return board && !board.is_deleted ? savedBoard(board) : null;
}

/**
 * The board a card's tints are checked against: the board it already links, so its types resolve to that board's own territories, else the saved Arrakis board it will link.
 * A linked board that is gone resolves no types.
 */
async function cardBoard(ctx: MutationCtx, data: unknown, arrakis: SavedBoard): Promise<SavedBoard> {
  const linked = (data as { board?: { asset_id?: unknown } }).board?.asset_id;
  if (typeof linked !== 'string') {
    return arrakis;
  }
  const id = ctx.db.normalizeId('assets', linked);
  const row = id ? await ctx.db.get('assets', id) : null;
  return row?.type === 'board' ? savedBoard(row) : { id: arrakis.id, properties: {} };
}

const arrakisBoardId = async (ctx: MutationCtx) => (await arrakisBoard(ctx))?.id ?? null;

/** The territory ids tints light on the board: those they name, and every territory of a type they name. */
function litTerritories(properties: Board['properties'], tints: readonly BoardTint[]) {
  const lit = new Set(tints.flatMap((tint) => tint.territories));
  const types = new Set<string>(tints.flatMap((tint) => tint.types ?? []));
  for (const property of Object.values(properties)) {
    if (types.has(property.type)) {
      lit.add(propertyId(property));
    }
  }
  return lit;
}

/* Whether a card's tints already light every territory its old highlights did, however each spells them (a type, or its territories). */
function covers(properties: Board['properties'], tints: readonly BoardTint[], tint: BoardTint) {
  const lit = litTerritories(properties, tints);
  return [...litTerritories(properties, [tint])].every((id) => lit.has(id));
}

/** A parsed card that is linked and keeps no old highlights. */
const onBoardAlready = (card: { highlights?: readonly unknown[]; board?: unknown }) =>
  Boolean(card.board) && !card.highlights?.length;

/**
 * A Spice card's data on the saved board: linked if it was not, its old highlight list emptied once its tints draw it.
 * Only those two fields change;
 * the rest is kept exactly as stored, so a parse's defaults never reach the row.
 * A row that no longer parses, or a linked card whose tints do not cover its old highlights, is left as it is for the verify to name.
 */
export function spiceCardOnBoard(data: unknown, board: SavedBoard): unknown {
  const parsed = SpiceAsset.safeParse(data);
  if (!parsed.success || onBoardAlready(parsed.data)) {
    return data;
  }
  const card = parsed.data;
  const stored = data as Record<string, unknown>;
  const carried = legacyHighlightTint(card.highlights ?? [], card.subName);
  if (card.board) {
    return !carried || covers(board.properties, card.board.tints, carried) ? { ...stored, highlights: [] } : data;
  }
  return { ...stored, highlights: [], board: { asset_id: board.id, tints: carried ? [carried] : [], tokens: [] } };
}

/** Whether a Spice card still needs moving: no board link, or an old highlight list left on it. */
export function spiceCardNeedsMove(data: unknown) {
  /* A row without card data has nothing on any board to move. */
  if (!data || typeof data !== 'object') {
    return false;
  }
  const card = data as { board?: unknown; highlights?: unknown };
  return !card.board || (Array.isArray(card.highlights) && card.highlights.length > 0);
}

/* A highlight on the built-in board named a territory no board has; Norbert confirmed it meant The Greater Flat (#1971). */
const MISSPELT_TERRITORIES: Record<string, string> = { 'greater-flat': 'the-greater-flat' };

type Entry = [key: string, item: unknown];

const misspeltTerritory = ([key, item]: Entry) =>
  key === 'territory' && typeof item === 'string' ? MISSPELT_TERRITORIES[item] : undefined;

/** Where the rename is in the Contents tree: the saved board's id, and whether this part sits on the built-in board. */
type Walk = { boardId: Id<'assets'>; onBuiltIn: boolean };

function renamed(entry: Entry, walk: Walk): unknown {
  if (entry[0] === 'boardId' && entry[1] === BUILT_IN_ARRAKIS_BOARD_ID) {
    return walk.boardId;
  }
  return (walk.onBuiltIn ? misspeltTerritory(entry) : undefined) ?? walkContents(entry[1], walk);
}

const onBuiltInBoard = (value: object) => (value as { boardId?: unknown }).boardId === BUILT_IN_ARRAKIS_BOARD_ID;

function walkContents(value: unknown, walk: Walk): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walkContents(item, walk));
  }
  if (value && typeof value === 'object') {
    const inner = { ...walk, onBuiltIn: walk.onBuiltIn || onBuiltInBoard(value) };
    return Object.fromEntries(Object.entries(value).map((entry) => [entry[0], renamed(entry, inner)]));
  }
  return value;
}

/**
 * Rulebook Contents with every board reference to the built-in Arrakis board renamed to the saved board's id.
 * The one misspelt territory is corrected only where it sits on the built-in board, so another board's own territory of that name is kept.
 */
export function contentsOnBoard(value: unknown, boardId: Id<'assets'>): unknown {
  return walkContents(value, { boardId, onBuiltIn: false });
}

/** Whether Contents still name the built-in board. */
export function namesOldBoardKeys(contents: unknown) {
  return JSON.stringify(contents).includes(`"boardId":"${BUILT_IN_ARRAKIS_BOARD_ID}"`);
}

/** Links every Spice card to the saved board and empties its old highlight list; a changed card indexes its board and is captured again. */
export const arrakis_spice_cards_v1 = migrations.define({
  table: 'assets',
  /* Each changed card queues a publication as large as its board, so a batch stays at the board-sized publication budget. */
  batchSize: publicationScanBatchSize(SPICE_CARD_ASSET_TYPE, 25),
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: async (ctx, row) => {
    const arrakis = spiceCardNeedsMove(row.data) ? await arrakisBoard(ctx) : null;
    if (!arrakis) {
      return;
    }
    const data = spiceCardOnBoard(row.data, await cardBoard(ctx, row.data, arrakis));
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

/** A live Spice card that still needs moving; a deleted one is moved too, but never blocks the deploy. */
const liveCardOffBoard = (row: { is_deleted: boolean; data: unknown }) =>
  !row.is_deleted && spiceCardNeedsMove(row.data);

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
    if (liveCardOffBoard(row) && (await arrakisBoardId(ctx))) {
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
