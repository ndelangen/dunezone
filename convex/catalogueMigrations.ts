import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { components, internal } from './_generated/api';
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

/**
 * This module's migrations under their ids, spread into `MIGRATION_IDS` so the deploy and the guard script run them like any other.
 * Typed by hand: inferred from `internal`, the type would name this module's own exports and the generated api would reference itself.
 */
export const CATALOGUE_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  catalogue_entries_rulesets_v1: internal.catalogueMigrations.catalogue_entries_rulesets_v1,
  catalogue_entries_rulesets_verify_v1: internal.catalogueMigrations.catalogue_entries_rulesets_verify_v1,
  catalogue_entries_factions_owner_v1: internal.catalogueMigrations.catalogue_entries_factions_owner_v1,
  catalogue_entries_factions_owner_verify_v1: internal.catalogueMigrations.catalogue_entries_factions_owner_verify_v1,
};
