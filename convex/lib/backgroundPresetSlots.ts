import { cardbackPresetKeySchema } from '../../src/shared/assets/cardbackPresetKeys';
import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { INITIAL_CARD_FRONT_PRESETS, cardFrontPresetKeySchema } from '../../src/shared/assets/cardFrontPresets';
import { INITIAL_DISCOVERY_PRESETS, discoveryKeySchema } from '../../src/shared/backgrounds/families';
import type { BackgroundData } from '../../src/shared/backgrounds/schema';
import type { QueryCtx } from '../types';
import { rawCardbackPreset } from './cardPresetDefaults';

type Reader = Pick<QueryCtx, 'db'>;
export type BackgroundSlot = {
  key: string;
  name: string;
  value: BackgroundData;
  revision: number;
  family?: string;
  back?: string;
};

async function frontSlots(
  ctx: Reader,
  initial: (typeof INITIAL_CARD_FRONT_PRESETS)[number]
): Promise<BackgroundSlot[]> {
  const row = await ctx.db
    .query('card_front_presets')
    .withIndex('by_key', (q) => q.eq('key', initial.key))
    .unique();
  const style = row?.style ?? initial.style;
  return Object.entries(style).flatMap(([region, value]) =>
    value
      ? [
          {
            key: `front/${initial.key}/${region === 'head' ? 'header' : 'icon'}`,
            name: `${initial.label} ${region === 'head' ? 'header' : 'icon'}`,
            value,
            revision: row?.revision ?? 0,
            family: initial.key,
          },
        ]
      : []
  );
}
async function backSlot(ctx: Reader, initial: (typeof INITIAL_CARDBACK_PRESETS)[number]): Promise<BackgroundSlot> {
  const row = await rawCardbackPreset(ctx, initial.key);
  return {
    key: `back/${initial.key}`,
    name: `${initial.label} back`,
    value: row.cardback.background,
    revision: row.revision,
    back: initial.key,
  };
}
async function discoverySlots(
  ctx: Reader,
  initial: (typeof INITIAL_DISCOVERY_PRESETS)[number]
): Promise<BackgroundSlot[]> {
  const row = await ctx.db
    .query('discovery_presets')
    .withIndex('by_key', (q) => q.eq('key', initial.key))
    .unique();
  const preset = row ?? initial;
  return (['front', 'back'] as const).map((face) => ({
    key: `${initial.key}/${face}`,
    name: `${initial.label} ${face}`,
    value: preset[face].background,
    revision: preset.revision,
  }));
}

/** The fixed family slots, read once for admin views and dependency propagation. */
export async function backgroundSlots(ctx: Reader): Promise<BackgroundSlot[]> {
  const [fronts, backs, discovery] = await Promise.all([
    Promise.all(INITIAL_CARD_FRONT_PRESETS.map((initial) => frontSlots(ctx, initial))),
    Promise.all(INITIAL_CARDBACK_PRESETS.map((initial) => backSlot(ctx, initial))),
    Promise.all(INITIAL_DISCOVERY_PRESETS.map((initial) => discoverySlots(ctx, initial))),
  ]);
  return [...fronts.flat(), ...backs, ...discovery.flat()];
}

async function frontSlotFor(ctx: Reader, family: string, region: string) {
  const key = cardFrontPresetKeySchema.safeParse(family);
  if (!key.success) {
    return null;
  }
  const slots = await frontSlots(
    ctx,
    INITIAL_CARD_FRONT_PRESETS.find((p) => p.key === key.data)!
  );
  return slots.find((slot) => slot.key === `front/${family}/${region}`) ?? null;
}
async function backSlotFor(ctx: Reader, family: string) {
  const key = cardbackPresetKeySchema.safeParse(family);
  if (!key.success) {
    return null;
  }
  return backSlot(
    ctx,
    INITIAL_CARDBACK_PRESETS.find((p) => p.key === key.data)!
  );
}
async function discoverySlotFor(ctx: Reader, family: string, region: string) {
  const key = discoveryKeySchema.safeParse(family);
  if (!key.success) {
    return null;
  }
  const slots = await discoverySlots(
    ctx,
    INITIAL_DISCOVERY_PRESETS.find((p) => p.key === key.data)!
  );
  return slots.find((slot) => slot.key === `${family}/${region}`) ?? null;
}

/** An individual capture reads only its own slot, not every family in the library. */
export async function backgroundSlotFor(ctx: Reader, key: string): Promise<BackgroundSlot | null> {
  const [kind, family, region] = key.split('/');
  let slot: BackgroundSlot | null;
  if (kind === 'front') {
    slot = await frontSlotFor(ctx, family, region);
  } else if (kind === 'back') {
    slot = await backSlotFor(ctx, family);
  } else {
    slot = await discoverySlotFor(ctx, kind, family);
  }
  return slot?.key === key ? slot : null;
}
