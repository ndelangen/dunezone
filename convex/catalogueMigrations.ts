import { Migrations } from '@convex-dev/migrations';

import { components } from './_generated/api';
import { internalMutation } from './functions';
import { assertCatalogueSourceExact, repairCatalogueEntry } from './lib/catalogueEntries';
import schema from './schema';

/*
 * The catalogue backfills from the ruleset kind on, and the profile sections' lists, kept out of `migrations.ts`, which is at its size limit.
 * Each is listed in `MIGRATION_IDS` there under its id, so the deploy runs it like any other; the earlier catalogue backfills stay where they are, since moving a migration renames it and would run it again.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'catalogueMigrations:',
  schema,
});

/** Builds the ruleset catalogue's entries from canonical rulesets, while live writes keep them current through triggers. */
export const catalogue_entries_rulesets_v1 = migrations.define({
  table: 'rulesets',
  /* A ruleset's About has no length cap and each reconcile rereads the ruleset, so a batch stays small. */
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'ruleset', row._id);
  },
});

/** Proves every live ruleset is in the catalogue exactly once, so an empty or partial catalogue cannot pass. */
export const catalogue_entries_rulesets_verify_v1 = migrations.define({
  table: 'rulesets',
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'ruleset', row._id);
  },
});

/**
 * Lists every live faction under its owner too, for the profile page's first few and the catalogue's `owner` filter.
 * The faction entries already exist, so each reconcile adds the owner list's row and its order items, and a replay writes nothing.
 */
export const catalogue_entries_factions_owner_v1 = migrations.define({
  table: 'factions',
  /* Faction text has no length cap and each reconcile rereads the faction, so a batch stays small, as the first faction backfill did. */
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'faction', row._id);
  },
});

/** Proves every live faction is in each of its lists, its owner's among them, exactly once. */
export const catalogue_entries_factions_owner_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'faction', row._id);
  },
});

/** Lists every question under its asker too, for the profile page's first few and its questions page. */
export const catalogue_entries_faq_asker_v1 = migrations.define({
  table: 'faq_items',
  /* A question is written into up to ten lists, each reconcile rereading it, so a batch stays well inside a transaction's limits. */
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'faq', row._id);
  },
});

/** Proves every question is in each of its FAQ lists, its asker's among them, exactly once. */
export const catalogue_entries_faq_asker_verify_v1 = migrations.define({
  table: 'faq_items',
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'faq', row._id);
  },
});

/** Builds the answer kind's entries from canonical answers, while live writes keep them current through triggers. */
export const catalogue_entries_answers_v1 = migrations.define({
  table: 'faq_answers',
  /* An answer has no length cap and each reconcile rereads it and its question. */
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'answer', row._id);
  },
});

/** Proves every answer is in its answerer's list, and in the picked list exactly when its question accepts it, so an empty or partial list cannot pass. */
export const catalogue_entries_answers_verify_v1 = migrations.define({
  table: 'faq_answers',
  batchSize: 25,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'answer', row._id);
  },
});
