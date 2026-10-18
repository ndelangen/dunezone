import { Migrations } from '@convex-dev/migrations';

import { components } from './_generated/api';
import { internalMutation } from './functions';
import { assertCatalogueSourceExact, repairCatalogueEntry } from './lib/catalogueEntries';
import schema from './schema';

/*
 * The catalogue backfills from the ruleset kind on, kept out of `migrations.ts`, which is at its size limit.
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
