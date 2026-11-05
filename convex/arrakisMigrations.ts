import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { SPICE_CARD_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { publicationJobsForAsset, publicationScanBatchSize } from './lib/publication';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import schema from './schema';

/*
 * Moves the last consumers of the built-in Arrakis map onto the saved Arrakis board (#1971).
 * Rulebook Contents that name the built-in board by its "arrakis" id name the saved board instead.
 * A deployment without the saved board changes nothing. A second pass finds nothing to change, so each is safe to replay.
 * The Spice card move ran in production on 5 November 2026 and read the highlight list the schema no longer has,
 * so its body and its verify's are no-ops whose ids stay until the snapshot is cut after them.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'arrakisMigrations:',
  schema,
});

/** The id Rulebook Contents gave the built-in Arrakis board. */
export const BUILT_IN_ARRAKIS_BOARD_ID = 'arrakis';

async function arrakisBoardId(ctx: MutationCtx): Promise<Id<'assets'> | null> {
  const board = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'board').eq('slug', ARRAKIS_BOARD_SLUG))
    .unique();
  return board && !board.is_deleted ? board._id : null;
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

/** Linked every Spice card to the saved board and carried its old highlights as a tint; done in production, so it changes nothing now. */
export const arrakis_spice_cards_v1 = migrations.define({
  table: 'assets',
  batchSize: 100,
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: () => undefined,
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

/** Proved the move done; production recorded it, and a Spice card may now be saved without a board, so it checks nothing now. */
export const arrakis_spice_cards_verify_v1 = migrations.define({
  table: 'assets',
  batchSize: 100,
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: () => undefined,
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

/*
 * The highlight list no card draws any more is removed from every stored card and its queued captures (#1971).
 * They ran in production on 5 November 2026, and `spice_highlights_narrow` removed the field from the schema behind them.
 * Production's rows have no list left, so a replay finds nothing; a snapshot cut before the move ran cannot load (see docs/convex-migrations.md).
 */

/** Stored card data without its `highlights` key; every other key is kept exactly as stored. */
function withoutHighlights(data: Record<string, unknown>): Record<string, unknown> {
  const { highlights: _highlights, ...rest } = data;
  return rest;
}

/** Whether stored data still carries a `highlights` key, whatever it holds. */
const hasHighlights = (data: unknown): data is Record<string, unknown> =>
  Boolean(data) && typeof data === 'object' && Object.hasOwn(data as object, 'highlights');

/**
 * A stored Spice card without its old highlight list, or the same data when there is nothing to remove.
 * A live card keeps a list that still names territories, so the verify names it instead of a tint silently going missing;
 * anything else under the key (an empty list, a value that is no list, or a deleted card's list) carries nothing and is removed.
 */
export function spiceCardWithoutHighlights(data: unknown, isDeleted: boolean): unknown {
  if (!hasHighlights(data)) {
    return data;
  }
  const { highlights } = data;
  const naming = Array.isArray(highlights) && highlights.length > 0;
  return naming && !isDeleted ? data : withoutHighlights(data);
}

/** A queued capture of a Spice card without its old highlight list, or the same payload when its card has none. */
export function spiceJobWithoutHighlights(assetData: unknown): unknown {
  const card = (assetData as { card?: unknown } | null)?.card;
  return hasHighlights(card) ? { ...(assetData as object), card: withoutHighlights(card) } : assetData;
}

/*
 * A capture running when the strip reaches its job is left alone: its completion hashes the payload it was given.
 * The lifecycle holds a card's jobs to single digits, so reading them with the card stays within the board-sized budget.
 */
const settledJob = (job: Doc<'publication_jobs'>) => job.status !== 'in_progress';

/**
 * Removes the old highlight list from every stored Spice card and from the card each of its queued captures carries, so a job queued before the strip still parses once the field is gone.
 * The face is unchanged, so nothing is captured again.
 */
export const arrakis_spice_highlights_strip_v1 = migrations.define({
  table: 'assets',
  /* Each card's jobs carry its board, so a batch stays at the board-sized budget. */
  batchSize: publicationScanBatchSize(SPICE_CARD_ASSET_TYPE, 50),
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: async (ctx, row) => {
    for (const job of await publicationJobsForAsset(ctx, row.type, row._id)) {
      const asset_data = spiceJobWithoutHighlights(job.asset_data);
      if (settledJob(job) && asset_data !== job.asset_data) {
        await ctx.db.patch(job._id, { asset_data });
      }
    }
    const data = spiceCardWithoutHighlights(row.data, row.is_deleted);
    return data === row.data ? undefined : { data };
  },
});

/** Fails on the first Spice card still carrying a highlight list, naming it. */
export const arrakis_spice_highlights_verify_cards_v1 = migrations.define({
  table: 'assets',
  batchSize: 100,
  customRange: (q) => q.withIndex('by_type_and_slug', (index) => index.eq('type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: (_ctx, row) => {
    if (hasHighlights(row.data)) {
      throw new Error(`card-spice ${row._id} still carries a highlights list.`);
    }
  },
});

/** Fails on the first settled Spice capture whose card still carries a highlight list, naming it. */
export const arrakis_spice_highlights_verify_jobs_v1 = migrations.define({
  table: 'publication_jobs',
  batchSize: publicationScanBatchSize(SPICE_CARD_ASSET_TYPE, 50),
  customRange: (q) =>
    q.withIndex('by_asset_type_status_created_at', (index) => index.eq('asset_type', SPICE_CARD_ASSET_TYPE)),
  migrateOne: (_ctx, job) => {
    if (settledJob(job) && spiceJobWithoutHighlights(job.asset_data) !== job.asset_data) {
      throw new Error(`publication job ${job._id} still captures a Spice card with a highlights list.`);
    }
  },
});

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
  arrakis_spice_highlights_strip_v1: internal.arrakisMigrations.arrakis_spice_highlights_strip_v1,
  arrakis_spice_highlights_verify_cards_v1: internal.arrakisMigrations.arrakis_spice_highlights_verify_cards_v1,
  arrakis_spice_highlights_verify_jobs_v1: internal.arrakisMigrations.arrakis_spice_highlights_verify_jobs_v1,
};
