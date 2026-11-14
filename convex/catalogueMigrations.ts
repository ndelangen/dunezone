import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import { assertCatalogueSourceExact, repairCatalogueEntry } from './lib/catalogueEntries';
import schema from './schema';

/*
 * The catalogue backfills from the ruleset kind on, in their own module.
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
 * Marks every live variant's entries with its Faction and adds the variant's name to their search text (#2929).
 * The entries exist already, so each reconcile replaces a row in place, and a replay writes nothing.
 * The deploy runs migrations by id, so this can run before `faction_families_v1`.
 * That one writes each faction's `family_id` through the triggers, which reconcile these entries as it goes.
 */
export const catalogue_entries_factions_family_v1 = migrations.define({
  table: 'factions',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'faction', row._id);
  },
});

/** Proves every live variant's entries match what its row says now, its Faction included, in each of its lists exactly once. */
export const catalogue_entries_factions_family_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'faction', row._id);
  },
});

/**
 * Lists every Faction with a live variant once, built from its variants' entries (#2929).
 * The deploy runs this before the family backfill above, whose id sorts later.
 * Each variant entry that backfill marks rebuilds its Faction's entry through the triggers, so the order does not matter.
 * Nothing reads these entries until the catalogue lists Factions.
 */
export const catalogue_entries_faction_families_v1 = migrations.define({
  table: 'faction_families',
  /* A family row carries its shared data, so a batch stays small. */
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await repairCatalogueEntry(ctx, 'faction_family', row._id);
  },
});

/** Proves every Faction with a live variant is in each of its lists exactly once. */
export const catalogue_entries_faction_families_verify_v1 = migrations.define({
  table: 'faction_families',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    await assertCatalogueSourceExact(ctx, 'faction_family', row._id);
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
  catalogue_entries_factions_family_v1: internal.catalogueMigrations.catalogue_entries_factions_family_v1,
  catalogue_entries_factions_family_verify_v1: internal.catalogueMigrations.catalogue_entries_factions_family_verify_v1,
  catalogue_entries_faction_families_v1: internal.catalogueMigrations.catalogue_entries_faction_families_v1,
  catalogue_entries_faction_families_verify_v1:
    internal.catalogueMigrations.catalogue_entries_faction_families_verify_v1,
};
