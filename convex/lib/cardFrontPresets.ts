import { ConvexError } from 'convex/values';

import type { CardFrontPreset, CardFrontPresetKey, CardFrontStyle } from '../../src/shared/assets/cardFrontPresets';
import {
  INITIAL_CARD_FRONT_PRESETS,
  cardFrontPresetKey,
  cardFrontPresetType,
} from '../../src/shared/assets/cardFrontPresets';
import { internal } from '../_generated/api';
import type { MutationCtx, QueryCtx } from '../types';

export async function cardFrontPresetFor(ctx: Pick<QueryCtx, 'db'>, key: CardFrontPresetKey): Promise<CardFrontPreset> {
  const initial = INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === key)!;
  const row = await ctx.db
    .query('card_front_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return { ...initial, style: row?.style ?? initial.style, revision: row?.revision ?? 0 };
}

export async function listCardFrontPresets(ctx: Pick<QueryCtx, 'db'>) {
  return Promise.all(INITIAL_CARD_FRONT_PRESETS.map(({ key }) => cardFrontPresetFor(ctx, key)));
}

export async function resolveCardFrontPreset(ctx: Pick<QueryCtx, 'db'>, type: string, data: unknown) {
  const key = cardFrontPresetKey(type, data);
  if (!key) {
    return undefined;
  }
  const { style, revision } = await cardFrontPresetFor(ctx, key);
  return { style, revision };
}

/* A saved style and the scan replacing its cards commit together. The previous publications stay available. */
export async function storeCardFrontPreset(
  ctx: MutationCtx,
  key: CardFrontPresetKey,
  style: CardFrontStyle,
  expectedRevision: number
) {
  const row = await ctx.db
    .query('card_front_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if ((row?.revision ?? 0) !== expectedRevision) {
    throw new ConvexError('This preset changed elsewhere. Reset to load the saved version.');
  }
  if (style.iconBackground === null && key !== 'nexus') {
    throw new ConvexError('Choose an icon background for this preset.');
  }
  const revision = expectedRevision + 1;
  const data = { key, style, revision, updated_at: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, data);
  } else {
    await ctx.db.insert('card_front_presets', data);
  }
  await ctx.scheduler.runAfter(0, internal.publicationRegeneration.scan, {
    assetType: cardFrontPresetType(key),
    cursor: null,
    scanned: 0,
    enqueued: 0,
  });
  return revision;
}
