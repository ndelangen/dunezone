import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';

import { CustomCardAsset } from '../src/shared/assets/schema';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { refreshDependentCards } from './assets';
import { internalMutation } from './functions';
import { syncCustomCardTokenRelations } from './lib/customCardTokens';
import { parseStoredFactionForRead } from './lib/factionInput';
import { storeVariantData } from './lib/factionVariants';
import { enqueueAssetPublication } from './lib/publication';
import { nowIso } from './lib/utils';
import schema from './schema';
import type { MutationCtx } from './types';

/*
 * Retires the enhance token type (#3013): Norbert chose on 22 November 2026 to retire it completely.
 * Battle plans never took an enhance token, and the Kwisatz Haderach is a leader token linked as a faction Extra now (#2995).
 * The ids sort in the order they run: references go before the tokens they point at.
 * A one-off family in its own module, deleted with its ids once production has run them and the type leaves the code.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'enhanceRetirementMigrations:',
  schema,
});

const RETIRED = 'token-enhance';

/**
 * The leader token that takes an enhance token's place on a card, where Norbert named one (23 November 2026).
 * The Kwisatz Haderach card's "+2" enhance token becomes the Kwisatz Haderach leader token.
 * Any other enhance layer is dropped.
 */
export const LAYER_SWAPS: ReadonlyMap<string, string> = new Map([
  ['ns78mth8xp26cpkaw1t4gc0es58cwx0p', 'ns7e5v288s7hab7fewjpmyqzx58gq6wk'],
]);

async function liveOfType(ctx: Pick<MutationCtx, 'db'>, raw: string, type: string): Promise<Doc<'assets'> | null> {
  const id = ctx.db.normalizeId('assets', raw);
  const row = id ? await ctx.db.get('assets', id) : null;
  return row && !row.is_deleted && row.type === type ? row : null;
}

/**
 * Takes every enhance token off the cards that draw one, before the tokens go.
 * A swapped layer keeps its place, turn, opacity and width.
 * The card republishes as a save would.
 */
export const enhance_retire_1_cards_v1 = migrations.define({
  table: 'assets',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    /* Production's survey found enhance layers on custom cards only. */
    if (row.is_deleted || row.type !== 'card-custom') {
      return;
    }
    const parsed = CustomCardAsset.safeParse(row.data);
    if (!parsed.success) {
      return;
    }
    let changed = false;
    const layers = [];
    for (const layer of parsed.data.layers) {
      if (layer.kind !== 'token' || !(await liveOfType(ctx, layer.asset_id, RETIRED))) {
        layers.push(layer);
        continue;
      }
      changed = true;
      const swap = LAYER_SWAPS.get(layer.asset_id);
      if (swap && (await liveOfType(ctx, swap, 'token-leader'))) {
        /* The same scale gives the leader the rectangle's width, the size of the round counters beside it (Norbert, 23 November 2026). */
        layers.push({ ...layer, asset_id: swap });
      }
    }
    if (!changed) {
      return;
    }
    const data = { ...(row.data as Record<string, unknown>), layers };
    await ctx.db.patch(row._id, { data, updated_at: nowIso() });
    await syncCustomCardTokenRelations(ctx, row._id, data);
    await enqueueAssetPublication(ctx, { _id: row._id, type: row.type, slug: row.slug, data });
    console.log(`Took the enhance token layers off card ${row.slug}.`);
  },
});

/** Deletes a bundle that holds nothing but enhance tokens, which would otherwise be left empty. */
export const enhance_retire_2_bundles_v1 = migrations.define({
  table: 'assets',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    if (row.is_deleted || row.type !== 'bundle') {
      return;
    }
    const members = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', row._id).eq('kind', 'bundle-token'))
      .take(256);
    if (!members.length) {
      return;
    }
    for (const member of members) {
      if (!(await liveOfType(ctx, member.to_asset_id as Id<'assets'>, RETIRED))) {
        return;
      }
    }
    await ctx.db.patch(row._id, { is_deleted: true, updated_at: nowIso() });
    console.log(`Deleted bundle ${row.slug}, which held only enhance tokens.`);
  },
});

/**
 * Takes every enhance token out of each faction's Extras.
 * A live variant saves through `storeVariantData`, so its sheet recaptures and its children follow.
 * A deleted one only has its data cleaned.
 */
export const enhance_retire_3_extras_v1 = migrations.define({
  table: 'factions',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    const data = parseStoredFactionForRead(row.data);
    const extras = data.extras ?? [];
    const kept = extras.filter((extra) => extra.type !== RETIRED);
    if (kept.length === extras.length) {
      return;
    }
    const cleaned = { ...data, extras: kept };
    if (row.is_deleted) {
      await ctx.db.patch(row._id, { data: cleaned });
    } else {
      await storeVariantData(ctx, row, cleaned);
    }
    console.log(`Removed ${extras.length - kept.length} enhance token(s) from the Extras of faction ${row.slug}.`);
  },
});

/** Deletes every live enhance token the way its owner's delete does: the row stays, marked deleted, and the cards drawing it redraw. */
export const enhance_retire_4_tokens_v1 = migrations.define({
  table: 'assets',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    if (row.type !== RETIRED || row.is_deleted) {
      return;
    }
    await ctx.db.patch(row._id, { is_deleted: true, updated_at: nowIso() });
    await refreshDependentCards(ctx, row.type, row._id);
    console.log(`Deleted enhance token ${row.slug} (${row._id}).`);
  },
});

/** Typed by hand, as `CATALOGUE_MIGRATION_IDS` is, so the generated api does not reference itself. */
export const ENHANCE_RETIREMENT_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  enhance_retire_1_cards_v1: internal.enhanceRetirementMigrations.enhance_retire_1_cards_v1,
  enhance_retire_2_bundles_v1: internal.enhanceRetirementMigrations.enhance_retire_2_bundles_v1,
  enhance_retire_3_extras_v1: internal.enhanceRetirementMigrations.enhance_retire_3_extras_v1,
  enhance_retire_4_tokens_v1: internal.enhanceRetirementMigrations.enhance_retire_4_tokens_v1,
};
