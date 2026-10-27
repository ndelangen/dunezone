import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { z } from 'zod';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import { troopHasRedStar, troopWithoutRedStar } from './lib/migrationHelpers';
import schema from './schema';

/*
 * The 27 Oct rewrites of the last old-format faction and preset rows, kept out of `migrations.ts`, which is at its size limit.
 * Each is listed in `MIGRATION_IDS` there under its id, so the deploy runs it like any other.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'legacyDataMigrations:',
  schema,
});

/* Validates only the two Faction leader keys and keeps every other field as stored. */
const storedFactionLeaderKeysSchema = z.looseObject({
  factionLeader: z.unknown().optional(),
  hero: z.unknown().optional(),
});

/**
 * Drops the old `hero` key from factions that already carry `factionLeader`, without changing the faction's edit timestamp.
 * `faction_faction_leader_key_v1` copied it across and left it on the row;
 * every live reader takes `factionLeader` first, so dropping the copy changes nothing they show.
 */
export const faction_hero_key_drop_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const data = storedFactionLeaderKeysSchema.parse(row.data);
    if (data.hero === undefined || data.factionLeader === undefined) {
      return;
    }
    const { hero: _hero, ...rest } = data;
    return { data: rest };
  },
});

/** Every stored faction, including deleted sources, must be free of `hero` before the live schemas stop reading it. */
export const faction_hero_key_drop_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const parsed = storedFactionLeaderKeysSchema.safeParse(row.data);
    if (!parsed.success || parsed.data.hero !== undefined) {
      throw new Error(`Faction ${row._id} still has a \`hero\` key.`);
    }
  },
});

/** A stored faction's troops as written, or none when the row has no troop list. */
function storedTroops(data: unknown): unknown[] {
  const troops = (data as { troops?: unknown } | null)?.troops;
  return Array.isArray(troops) ? troops : [];
}

/**
 * Rewrites a troop face's retired `-red` star to its base star with the same red as its hue, without changing the faction's edit timestamp.
 * The two star files are identical and the renderer paints a `-red` star without a hue `red`, so the rewrite draws the same token;
 * it is the change the editor already makes when the field renders.
 * A face that sets its own hue keeps it.
 */
export const faction_troop_red_star_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    const troops = storedTroops(row.data);
    if (!troops.some(troopHasRedStar)) {
      return;
    }
    return { data: { ...(row.data as object), troops: troops.map(troopWithoutRedStar) } };
  },
});

/** Every stored faction, including deleted sources, must be free of `-red` stars before the renderer stops reading them. */
export const faction_troop_red_star_verify_v1 = migrations.define({
  table: 'factions',
  batchSize: 50,
  migrateOne: async (_ctx, row) => {
    if (storedTroops(row.data).some(troopHasRedStar)) {
      throw new Error(`Faction ${row._id} still has a troop face with a \`-red\` star.`);
    }
  },
});

/**
 * Drops the retired `nameScale` and `nameFont` from stored card-back presets.
 * Labels have shrunk to fit and rendered in regular Busorama since those fields retired, so the renderer ignores both and the preset draws the same back.
 * The revision stays, because the published image does not change.
 */
export const cardback_presets_retired_label_fields_v1 = migrations.define({
  table: 'cardback_presets',
  migrateOne: async (_ctx, row) => {
    if (row.cardback.nameScale === undefined && row.cardback.nameFont === undefined) {
      return;
    }
    const { nameScale: _nameScale, nameFont: _nameFont, ...cardback } = row.cardback;
    return { cardback };
  },
});

/** Every stored card-back preset must be free of the retired label fields before the schema stops accepting them. */
export const cardback_presets_retired_label_fields_verify_v1 = migrations.define({
  table: 'cardback_presets',
  migrateOne: async (_ctx, row) => {
    if (row.cardback.nameScale !== undefined || row.cardback.nameFont !== undefined) {
      throw new Error(`Card-back preset ${row.key} still has a retired label field.`);
    }
  },
});

export const LEGACY_DATA_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  faction_hero_key_drop_v1: internal.legacyDataMigrations.faction_hero_key_drop_v1,
  faction_hero_key_drop_verify_v1: internal.legacyDataMigrations.faction_hero_key_drop_verify_v1,
  faction_troop_red_star_v1: internal.legacyDataMigrations.faction_troop_red_star_v1,
  faction_troop_red_star_verify_v1: internal.legacyDataMigrations.faction_troop_red_star_verify_v1,
  cardback_presets_retired_label_fields_v1: internal.legacyDataMigrations.cardback_presets_retired_label_fields_v1,
  cardback_presets_retired_label_fields_verify_v1:
    internal.legacyDataMigrations.cardback_presets_retired_label_fields_verify_v1,
};
