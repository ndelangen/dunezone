import { ConvexError } from 'convex/values';

import type { CardbackPresetKey } from '../../src/shared/assets/cardbackPresetKeys';
import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import type { CardbackPreset } from '../../src/shared/assets/cardbackPresets';
import { INITIAL_CARD_FRONT_PRESETS } from '../../src/shared/assets/cardFrontPresets';
import type { CardFrontPresetKey, AuthoredCardFrontStyle } from '../../src/shared/assets/cardFrontPresets';
import { authoredCardback, CardBack, DeckAsset, TokenAsset, TreacheryAsset } from '../../src/shared/assets/schema';
import type { DISCOVERY_FAMILIES, DiscoveryPreset } from '../../src/shared/backgrounds/families';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { assertReferenceableDeckCardback, authoredDeckCardback, deckCardbackOf } from './assetBacks';
import { presetFromKey } from './cardbackPresets';

type Reader = Pick<QueryCtx, 'db'>;
async function sourceAsset(ctx: Reader, type: string, slug: string) {
  const row = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', type).eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) {
    throw new ConvexError(`The source ${type} ${slug} is missing. Restore it before importing presets.`);
  }
  return row;
}

/** Source assets are read only during an explicit import, never by live preset consumers. */
export async function rawCardFrontPreset(
  ctx: Reader,
  key: CardFrontPresetKey,
  importSource = false
): Promise<{ style: AuthoredCardFrontStyle; revision: number }> {
  const row = await ctx.db
    .query('card_front_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (row) {
    return row;
  }
  if (importSource && key === 'prediction') {
    const asset = await sourceAsset(ctx, 'card-treachery', 'prediction');
    const data = TreacheryAsset.parse(asset.data);
    return { style: { head: data.head, iconBackground: data.icon[0] }, revision: 0 };
  }
  return { style: INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === key)!.style, revision: 0 };
}

/** Following a Discovery standard requires a saved preset, independent of its original token. */
export async function rawDiscoveryPreset(
  ctx: Reader,
  family: (typeof DISCOVERY_FAMILIES)[number],
  importSource = false
): Promise<DiscoveryPreset | null> {
  const row = await ctx.db
    .query('discovery_presets')
    .withIndex('by_key', (q) => q.eq('key', family.key))
    .unique();
  if (row) {
    return { key: row.key, label: row.label, front: row.front, back: row.back, revision: row.revision };
  }
  if (!importSource) {
    return null;
  }
  const asset = await sourceAsset(ctx, 'token-disc', family.sourceSlug);
  const data = TokenAsset.parse(asset.data);
  if (data.back.mode === 'reference') {
    throw new ConvexError('The source Discovery token needs its own back before importing presets.');
  }
  return {
    key: family.key,
    label: family.label,
    front: data.front,
    back: data.back.mode === 'custom' ? data.back.face : data.front,
    revision: 0,
  };
}

/** Existing deck designs are copied into presets by the import; normal reads never follow a mutable deck. */
export async function rawCardbackPreset(
  ctx: Pick<QueryCtx, 'db'>,
  key: CardbackPresetKey,
  importSource = false
): Promise<{ cardback: CardbackPreset['cardback']; revision: number }> {
  const row = await ctx.db
    .query('cardback_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (row) {
    return { cardback: row.cardback, revision: row.revision };
  }
  const initial = INITIAL_CARDBACK_PRESETS.find((entry) => entry.key === key)!;
  if (importSource && ['stronghold', 'homeworld', 'nexus', 'leader-skill'].includes(key)) {
    const deck = await sourceAsset(ctx, 'deck', `${key}-deck`);
    const cardback = await importedDeckBack(ctx, deck);
    return { cardback, revision: 0 };
  }
  return { cardback: initial.cardback, revision: 0 };
}

async function importedDeckBack(ctx: Reader, deck: Doc<'assets'>): Promise<CardbackPreset['cardback']> {
  const back = DeckAsset.shape.cardback.parse(deckCardbackOf(deck.data));
  if (back.mode === 'custom') {
    return authoredCardback(back)!;
  }
  if (back.mode === 'preset') {
    return (await presetFromKey(ctx, back.key, new Map()))!.cardback;
  }
  const targetId = ctx.db.normalizeId('assets', back.asset_id);
  if (!targetId) {
    throw new ConvexError(
      'The source deck references an invalid cardback. Choose another back before importing presets.'
    );
  }
  const target = await assertReferenceableDeckCardback(ctx, deck, targetId);
  return CardBack.parse(authoredDeckCardback(target));
}
