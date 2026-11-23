import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';

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

/** A stored layer, read without trusting the row to satisfy the current schema. */
type StoredLayer = { kind?: unknown; asset_id?: unknown };

/** The cards whose layers can draw a token: Custom and Storm cards share the layer list. */
const LAYERED_CARD_TYPES = new Set(['card-custom', 'card-storm']);

/** The enhance token a layer draws, or null when it draws anything else. */
async function retiredLayerToken(ctx: Pick<MutationCtx, 'db'>, layer: StoredLayer): Promise<string | null> {
  if (layer.kind !== 'token' || typeof layer.asset_id !== 'string') {
    return null;
  }
  return (await liveOfType(ctx, layer.asset_id, RETIRED)) ? layer.asset_id : null;
}

/**
 * The leader a named swap points at, which must be live.
 * A missing one stops the migration before the card is saved, so the layer is kept for a retry rather than dropped.
 */
async function swapTarget(ctx: Pick<MutationCtx, 'db'>, leaderId: string): Promise<string> {
  if (!(await liveOfType(ctx, leaderId, 'token-leader'))) {
    throw new ConvexError(
      `The Kwisatz Haderach leader token ${leaderId} is missing; restore it before this migration runs.`
    );
  }
  return leaderId;
}

/** A live Custom or Storm card's stored layers, or null for any other row. */
function storedLayers(row: Doc<'assets'>): StoredLayer[] | null {
  if (row.is_deleted || !LAYERED_CARD_TYPES.has(row.type)) {
    return null;
  }
  const layers = (row.data as { layers?: unknown } | null)?.layers;
  return Array.isArray(layers) ? (layers as StoredLayer[]) : null;
}

/**
 * The card's layers with each enhance token swapped or dropped, or null when none drew one.
 * A swapped layer keeps its place, turn, opacity and width.
 */
async function withoutRetiredLayers(
  ctx: Pick<MutationCtx, 'db'>,
  layers: StoredLayer[]
): Promise<StoredLayer[] | null> {
  let changed = false;
  const kept: StoredLayer[] = [];
  for (const layer of layers) {
    const assetId = await retiredLayerToken(ctx, layer);
    if (!assetId) {
      kept.push(layer);
      continue;
    }
    changed = true;
    const swap = LAYER_SWAPS.get(assetId);
    if (swap) {
      /* The same scale gives the leader the rectangle's width, the size of the round counters beside it (Norbert, 23 November 2026). */
      kept.push({ ...layer, asset_id: await swapTarget(ctx, swap) });
    }
  }
  return changed ? kept : null;
}

/**
 * Takes every enhance token off the Custom and Storm cards that draw one, before the tokens go.
 * The card republishes as a save would.
 * A Spice card's placed enhance token is left to the token's deletion, which redraws the card as any owner's delete does.
 */
export const enhance_retire_1_cards_v1 = migrations.define({
  table: 'assets',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    const stored = storedLayers(row);
    const layers = stored && (await withoutRetiredLayers(ctx, stored));
    if (!layers) {
      return;
    }
    const data = { ...(row.data as Record<string, unknown>), layers };
    await ctx.db.patch(row._id, { data, updated_at: nowIso() });
    await syncCustomCardTokenRelations(ctx, row._id, data);
    await enqueueAssetPublication(ctx, { _id: row._id, type: row.type, slug: row.slug, data });
    console.log(`Took the enhance token layers off card ${row.slug}.`);
  },
});

function countsAsRetired(token: Doc<'assets'> | null, deletedToo: boolean): boolean {
  return token?.type === RETIRED && (deletedToo || !token.is_deleted);
}

/**
 * True when the bundle has members and every one is an enhance token, live unless `deletedToo`.
 * It stops reading at the first other member.
 */
async function holdsOnlyRetired(
  ctx: Pick<MutationCtx, 'db'>,
  bundleId: Id<'assets'>,
  deletedToo = false
): Promise<boolean> {
  let members = 0;
  for await (const member of ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', bundleId).eq('kind', 'bundle-token'))) {
    if (!countsAsRetired(await ctx.db.get('assets', member.to_asset_id), deletedToo)) {
      return false;
    }
    members += 1;
  }
  return members > 0;
}

/** Deletes a bundle that holds nothing but enhance tokens, which would otherwise be left empty. */
export const enhance_retire_2_bundles_v1 = migrations.define({
  table: 'assets',
  batchSize: 8,
  migrateOne: async (ctx, row) => {
    const liveBundle = !row.is_deleted && row.type === 'bundle';
    if (!liveBundle || !(await holdsOnlyRetired(ctx, row._id))) {
      return;
    }
    await ctx.db.patch(row._id, { is_deleted: true, updated_at: nowIso() });
    console.log(`Deleted bundle ${row.slug}, which held only enhance tokens.`);
  },
});

/** True for an Extra the retirement takes away: an enhance token, or a bundle the step before deleted for holding only enhance tokens. */
async function retiredExtra(ctx: Pick<MutationCtx, 'db'>, raw: unknown): Promise<boolean> {
  const extra = (raw ?? {}) as { type?: unknown; slug?: unknown };
  if (extra.type === RETIRED) {
    return true;
  }
  const slug = extra.type === 'bundle' ? extra.slug : null;
  if (typeof slug !== 'string') {
    return false;
  }
  const bundle = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'bundle').eq('slug', slug))
    .first();
  return !!bundle?.is_deleted && (await holdsOnlyRetired(ctx, bundle._id, true));
}

/** The positions of the raw Extras the retirement takes away. */
async function retiredExtraIndexes(ctx: Pick<MutationCtx, 'db'>, raw: unknown[]): Promise<Set<number>> {
  const doomed = new Set<number>();
  for (const [index, extra] of raw.entries()) {
    if (await retiredExtra(ctx, extra)) {
      doomed.add(index);
    }
  }
  return doomed;
}

/** Saves the faction without those Extras: a deleted row is only cleaned, a live variant saves as an edit would. */
async function dropExtras(
  ctx: MutationCtx,
  row: Doc<'factions'>,
  raw: { type?: unknown; slug?: unknown }[],
  doomed: Set<number>
) {
  if (row.is_deleted) {
    await ctx.db.patch(row._id, { data: { ...row.data, extras: raw.filter((_, index) => !doomed.has(index)) } });
    return;
  }
  const data = parseStoredFactionForRead(row.data);
  const gone = new Set([...doomed].map((index) => JSON.stringify([raw[index].type, raw[index].slug])));
  await storeVariantData(ctx, row, {
    ...data,
    extras: (data.extras ?? []).filter((extra) => !gone.has(JSON.stringify([extra.type, extra.slug]))),
  });
}

/**
 * Takes every enhance token, and every bundle of only enhance tokens, out of each faction's Extras.
 * The raw Extras are checked first, so a row older than today's faction schema is only parsed when it has something to lose.
 * A live variant saves through `storeVariantData`, so its sheet recaptures and its children follow.
 * A deleted one only has its data cleaned.
 */
export const enhance_retire_3_extras_v1 = migrations.define({
  table: 'factions',
  batchSize: 10,
  migrateOne: async (ctx, row) => {
    const raw = (row.data as { extras?: unknown } | null)?.extras;
    const doomed = Array.isArray(raw) ? await retiredExtraIndexes(ctx, raw) : new Set<number>();
    if (!doomed.size) {
      return;
    }
    await dropExtras(ctx, row, raw as { type?: unknown; slug?: unknown }[], doomed);
    console.log(`Removed ${doomed.size} retired Extra(s) from faction ${row.slug}.`);
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
