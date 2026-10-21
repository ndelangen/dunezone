import { ConvexError } from 'convex/values';

import type {
  CardFrontPreset,
  CardFrontPresetKey,
  CardFrontStyle,
  AuthoredCardFrontStyle,
} from '../../src/shared/assets/cardFrontPresets';
import {
  INITIAL_CARD_FRONT_PRESETS,
  cardFrontPresetKey,
  cardFrontStyleFor,
} from '../../src/shared/assets/cardFrontPresets';
import { internal } from '../_generated/api';
import type { MutationCtx, QueryCtx } from '../types';
import {
  legacyBackground,
  preserveVirtualBackgrounds,
  resolveBackgrounds,
  validateBackgroundLinks,
} from './backgroundPresets';

export async function cardFrontPresetFor(ctx: Pick<QueryCtx, 'db'>, key: CardFrontPresetKey): Promise<CardFrontPreset> {
  const initial = INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === key)!;
  const row = await ctx.db
    .query('card_front_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  const authored: AuthoredCardFrontStyle = row?.style ?? initial.style;
  const style = await resolveBackgrounds(ctx, {
    head: authored.head.source
      ? authored.head
      : { ...authored.head, source: { kind: 'preset', key: `front/${key}/header` } },
    iconBackground:
      authored.iconBackground === null
        ? null
        : authored.iconBackground.source
          ? authored.iconBackground
          : { ...authored.iconBackground, source: { kind: 'preset', key: `front/${key}/icon` } },
  });
  return { ...initial, style, revision: row?.revision ?? 0 };
}

export async function listCardFrontPresets(ctx: Pick<QueryCtx, 'db'>) {
  return Promise.all(INITIAL_CARD_FRONT_PRESETS.map(({ key }) => cardFrontPresetFor(ctx, key)));
}

export async function resolveCardFrontPreset(ctx: Pick<QueryCtx, 'db'>, type: string, data: unknown) {
  const key = cardFrontPresetKey(type, data);
  if (!key) {
    return undefined;
  }
  const preset = await cardFrontPresetFor(ctx, key);
  return { style: await resolveBackgrounds(ctx, cardFrontStyleFor(type, data, [preset])!), revision: preset.revision };
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
  const initial = INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === key)!;
  const previous = row?.style ?? initial.style;
  const effective = await cardFrontPresetFor(ctx, key);
  const authored = {
    head: legacyBackground(style.head, previous.head, effective.style.head, `front/${key}/header`),
    iconBackground: style.iconBackground
      ? legacyBackground(
          style.iconBackground,
          previous.iconBackground ?? style.iconBackground,
          effective.style.iconBackground ?? style.iconBackground,
          `front/${key}/icon`
        )
      : null,
  };
  await preserveVirtualBackgrounds(ctx, [`front/${key}/header`, `front/${key}/icon`]);
  await validateBackgroundLinks(ctx, authored);
  const revision = expectedRevision + 1;
  const data = { key, style: authored, revision, updated_at: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, data);
  } else {
    await ctx.db.insert('card_front_presets', data);
  }
  await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
    key,
    regions: ['header', 'icon'],
    cursor: null,
  });
  return revision;
}
