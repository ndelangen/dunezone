import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { hasLegacyEmblems, renameLegacyEmblems } from '../src/shared/legacyEmblem';
import { components, internal } from './_generated/api';
import type { Doc, TableNames } from './_generated/dataModel';
import { internalMutation } from './functions';
import { syncFactionCard } from './lib/factionCards';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import schema from './schema';

/*
 * The rename of "logo" to "Emblem" (the glossary term), kept out of `migrations.ts`, which is at its size limit.
 * Each migration rewrites the old names wherever a row stores them: a `logo` key becomes `emblem`, and a `/vector/logo/` path becomes `/vector/emblem/`.
 * `renameLegacyEmblems` in src/shared/legacyEmblem.ts is the one rewrite; the live decoders read the old names too, for rows not reached yet.
 * A rewrite keeps every edit timestamp, and a second pass finds nothing to change, so each is safe to replay.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'emblemMigrations:',
  schema,
});

/** The fields of a row that hold the old names, rewritten; empty when the row has none. */
function renamedFields(row: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(row)) {
    if (!field.startsWith('_') && hasLegacyEmblems(value)) {
      fields[field] = renameLegacyEmblems(value);
    }
  }
  return fields;
}

/** Rewrites one table's rows; any user field may hold an emblem, so every one is read. */
function renameIn<Table extends TableNames>(table: Table, batchSize = 25) {
  return migrations.define({
    table,
    batchSize,
    migrateOne: async (_ctx, row) => {
      const fields = renamedFields(row as Record<string, unknown>);
      return Object.keys(fields).length > 0 ? (fields as Partial<Doc<Table>>) : undefined;
    },
  });
}

/** Fails on the first row of a table that still holds an old name, naming it, so the deploy cannot report the rename done early. */
function verifyIn<Table extends TableNames>(table: Table, batchSize = 50) {
  return migrations.define({
    table,
    batchSize,
    migrateOne: async (_ctx, row) => {
      if (Object.keys(renamedFields(row as Record<string, unknown>)).length > 0) {
        throw new Error(`${table} ${row._id} still names a logo.`);
      }
    },
  });
}

/* The tables that store authored artwork: factions, assets, presets and queued captures. */
export const emblem_rename_factions_v1 = renameIn('factions');
export const emblem_rename_assets_v1 = renameIn('assets');
/* A rulebook render job's payload can approach the document limit, so the batch is as small as the table's earlier migrations. */
export const emblem_rename_publication_jobs_v1 = renameIn('publication_jobs', 4);
export const emblem_rename_background_presets_v1 = renameIn('background_presets');
export const emblem_rename_discovery_presets_v1 = renameIn('discovery_presets');
export const emblem_rename_card_front_presets_v1 = renameIn('card_front_presets');
export const emblem_rename_cardback_presets_v1 = renameIn('cardback_presets');

/**
 * Rebuilds every faction's card under `FACTION_CARD_PROJECTION` 2, the projection that names the emblem.
 * A faction the rename rewrote already rebuilt its card through the faction trigger, so this writes only the cards that missed it;
 * rerunning it writes nothing.
 */
export const faction_cards_v2 = migrations.define({
  table: 'factions',
  /* Faction text has no length cap, and each faction reads its card too, so a batch stays small, like `faction_cards_v1`. */
  batchSize: 10,
  migrateOne: async (ctx, faction) => {
    await syncFactionCard(ctx, faction._id, faction);
  },
});

/**
 * Rewrites a saved draft's Contents and its Contents hash, which is taken over the parsed Contents and so changes with them.
 * The settings-and-Contents hash is dropped rather than rebuilt: a missing one means a full comparison, which is always right.
 */
export const emblem_rename_rulebook_drafts_v1 = migrations.define({
  table: 'rulebook_drafts',
  batchSize: 2,
  migrateOne: async (_ctx, draft) => {
    if (!hasLegacyEmblems(draft.contents)) {
      return;
    }
    const contents = renameLegacyEmblems(draft.contents);
    return { contents, contents_hash: rulebookDraftContentsHash(contents), authored_hash: undefined };
  },
});

/** Rewrites an Edition's Contents and the two hashes its metadata row keeps of them, as the draft rewrite does. */
export const emblem_rename_rulebook_edition_contents_v1 = migrations.define({
  table: 'rulebook_edition_contents',
  batchSize: 2,
  migrateOne: async (ctx, row) => {
    if (!hasLegacyEmblems(row.contents)) {
      return;
    }
    const contents = renameLegacyEmblems(row.contents);
    await ctx.db.patch(row.edition_id, {
      contents_hash: rulebookEditionContentsHash(contents),
      authored_hash: undefined,
    });
    return { contents };
  },
});

export const emblem_rename_factions_verify_v1 = verifyIn('factions');
export const emblem_rename_assets_verify_v1 = verifyIn('assets');
export const emblem_rename_publication_jobs_verify_v1 = verifyIn('publication_jobs', 4);
export const emblem_rename_background_presets_verify_v1 = verifyIn('background_presets');
export const emblem_rename_discovery_presets_verify_v1 = verifyIn('discovery_presets');
export const emblem_rename_card_front_presets_verify_v1 = verifyIn('card_front_presets');
export const emblem_rename_cardback_presets_verify_v1 = verifyIn('cardback_presets');
export const emblem_rename_rulebook_drafts_verify_v1 = verifyIn('rulebook_drafts', 2);
export const emblem_rename_rulebook_edition_contents_verify_v1 = verifyIn('rulebook_edition_contents', 2);

/**
 * This module's migrations under their ids, spread into `MIGRATION_IDS` so the deploy and the guard script run them like any other.
 * Typed by hand: inferred from `internal`, the type would name this module's own exports and the generated api would reference itself.
 */
export const EMBLEM_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  emblem_rename_factions_v1: internal.emblemMigrations.emblem_rename_factions_v1,
  emblem_rename_assets_v1: internal.emblemMigrations.emblem_rename_assets_v1,
  emblem_rename_publication_jobs_v1: internal.emblemMigrations.emblem_rename_publication_jobs_v1,
  emblem_rename_background_presets_v1: internal.emblemMigrations.emblem_rename_background_presets_v1,
  emblem_rename_discovery_presets_v1: internal.emblemMigrations.emblem_rename_discovery_presets_v1,
  emblem_rename_card_front_presets_v1: internal.emblemMigrations.emblem_rename_card_front_presets_v1,
  emblem_rename_cardback_presets_v1: internal.emblemMigrations.emblem_rename_cardback_presets_v1,
  faction_cards_v2: internal.emblemMigrations.faction_cards_v2,
  emblem_rename_rulebook_drafts_v1: internal.emblemMigrations.emblem_rename_rulebook_drafts_v1,
  emblem_rename_rulebook_edition_contents_v1: internal.emblemMigrations.emblem_rename_rulebook_edition_contents_v1,
  emblem_rename_factions_verify_v1: internal.emblemMigrations.emblem_rename_factions_verify_v1,
  emblem_rename_assets_verify_v1: internal.emblemMigrations.emblem_rename_assets_verify_v1,
  emblem_rename_publication_jobs_verify_v1: internal.emblemMigrations.emblem_rename_publication_jobs_verify_v1,
  emblem_rename_background_presets_verify_v1: internal.emblemMigrations.emblem_rename_background_presets_verify_v1,
  emblem_rename_discovery_presets_verify_v1: internal.emblemMigrations.emblem_rename_discovery_presets_verify_v1,
  emblem_rename_card_front_presets_verify_v1: internal.emblemMigrations.emblem_rename_card_front_presets_verify_v1,
  emblem_rename_cardback_presets_verify_v1: internal.emblemMigrations.emblem_rename_cardback_presets_verify_v1,
  emblem_rename_rulebook_drafts_verify_v1: internal.emblemMigrations.emblem_rename_rulebook_drafts_verify_v1,
  emblem_rename_rulebook_edition_contents_verify_v1:
    internal.emblemMigrations.emblem_rename_rulebook_edition_contents_verify_v1,
};
