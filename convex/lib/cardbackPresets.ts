import { ConvexError } from 'convex/values';

import { cardbackPresetKeySchema } from '../../src/shared/assets/cardbackPresetKeys';
import type { CardbackPresetKey } from '../../src/shared/assets/cardbackPresetKeys';
import type { CardbackPreset } from '../../src/shared/assets/cardbackPresets';
import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { publicationStatusFor } from '../assetPublishingStatus';
import type { MutationCtx, QueryCtx } from '../types';
import { enqueuePublicationJob } from './publication';

/**
 * The presets one query has already read, keyed by preset.
 * A page of decks mostly shares a handful of presets, so a reader passes one memo to every lookup and reads each preset once.
 */
export type CardbackPresetMemo = Map<CardbackPresetKey, CardbackPreset>;

async function presetFor(ctx: Pick<QueryCtx, 'db'>, key: CardbackPresetKey, memo: CardbackPresetMemo) {
  const known = memo.get(key);
  if (known) {
    return known;
  }
  const initial = INITIAL_CARDBACK_PRESETS.find((preset) => preset.key === key)!;
  const row = await ctx.db
    .query('cardback_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  const status = await publicationStatusFor(ctx, 'cardback-preset', key);
  const preset: CardbackPreset = {
    key,
    label: initial.label,
    cardback: row?.cardback ?? initial.cardback,
    revision: row?.revision ?? 0,
    href: status.publicationHref,
    captureStatus: status.captureStatus,
  };
  memo.set(key, preset);
  return preset;
}

export async function listCardbackPresets(ctx: Pick<QueryCtx, 'db'>, memo: CardbackPresetMemo = new Map()) {
  return Promise.all(INITIAL_CARDBACK_PRESETS.map(({ key }) => presetFor(ctx, key, memo)));
}

/** Activation creates missing definitions and republishes saved designs without overwriting an Administrator's edits. */
export async function publishCardbackPresets(ctx: MutationCtx) {
  for (const initial of INITIAL_CARDBACK_PRESETS) {
    const row = await ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique();
    if (!row) {
      await ctx.db.insert('cardback_presets', {
        key: initial.key,
        cardback: initial.cardback,
        revision: 1,
        updated_at: Date.now(),
      });
    }
    await enqueuePublicationJob(ctx, {
      assetType: 'cardback-preset',
      assetId: initial.key,
      assetData: { assetId: initial.key, slug: initial.key, cardback: row?.cardback ?? initial.cardback },
    });
  }
}

/** Store an explicitly chosen preset revision and queue its shared replacement in the same transaction. */
export async function storeCardbackPreset(
  ctx: MutationCtx,
  key: CardbackPresetKey,
  cardback: CardbackPreset['cardback'],
  expectedRevision: number
) {
  const row = await ctx.db
    .query('cardback_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if ((row?.revision ?? 0) !== expectedRevision) {
    throw new ConvexError('This preset changed elsewhere. Reset to load the saved version.');
  }
  const revision = expectedRevision + 1;
  const data = { key, cardback, revision, updated_at: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, data);
  } else {
    await ctx.db.insert('cardback_presets', data);
  }
  await enqueuePublicationJob(ctx, {
    assetType: 'cardback-preset',
    assetId: key,
    assetData: { assetId: key, slug: key, cardback },
  });
  return revision;
}

/** Legacy deck records are untyped JSON; reject malformed preset keys before resolving them. */
export async function presetFromKey(ctx: Pick<QueryCtx, 'db'>, value: unknown, memo: CardbackPresetMemo) {
  const key = cardbackPresetKeySchema.safeParse(value);
  return key.success ? presetFor(ctx, key.data, memo) : null;
}
