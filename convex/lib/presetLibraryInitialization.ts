import { ConvexError } from 'convex/values';

import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { INITIAL_CARD_FRONT_PRESETS } from '../../src/shared/assets/cardFrontPresets';
import { INITIAL_BACKGROUND_PRESETS } from '../../src/shared/backgrounds/defaults';
import { DISCOVERY_FAMILIES } from '../../src/shared/backgrounds/families';
import { backgroundValue } from '../../src/shared/backgrounds/schema';
import type { MutationCtx, QueryCtx } from '../types';
import { assertBackgroundCapacity, listBackgroundPresets, resolveBackgrounds } from './backgroundPresets';
import { queueBackgroundRecaptures } from './backgroundRegeneration';
import { rawCardbackPreset, rawCardFrontPreset, rawDiscoveryPreset } from './cardPresetDefaults';

export async function presetLibraryReady(ctx: Pick<QueryCtx, 'db'>) {
  const [fronts, backs, discovery, backgrounds] = await Promise.all([
    ctx.db.query('card_front_presets').take(INITIAL_CARD_FRONT_PRESETS.length + 1),
    ctx.db.query('cardback_presets').take(INITIAL_CARDBACK_PRESETS.length + 1),
    ctx.db.query('discovery_presets').take(DISCOVERY_FAMILIES.length + 1),
    ctx.db.query('background_presets').take(201),
  ]);
  return (
    INITIAL_CARD_FRONT_PRESETS.every((p) => fronts.some((row) => row.key === p.key)) &&
    INITIAL_CARDBACK_PRESETS.every((p) => backs.some((row) => row.key === p.key)) &&
    DISCOVERY_FAMILIES.every((p) => discovery.some((row) => row.key === p.key)) &&
    INITIAL_BACKGROUND_PRESETS.every((p) => backgrounds.some((row) => row.key === p.key))
  );
}

/** One explicit admin operation copies current designs into durable presets; existing rows always win. */
export async function initializePresetLibrary(ctx: MutationCtx) {
  if (await presetLibraryReady(ctx)) {
    return;
  }
  const updated_at = Date.now();
  const imported: string[] = [];
  await Promise.all([
    ...INITIAL_CARD_FRONT_PRESETS.map(async ({ key }) => {
      const current = await ctx.db
        .query('card_front_presets')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique();
      if (!current) {
        const source = await rawCardFrontPreset(ctx, key, true);
        await ctx.db.insert('card_front_presets', {
          key,
          style: await resolveBackgrounds(ctx, source.style),
          revision: 1,
          updated_at,
        });
        imported.push(`front/${key}/header`, `front/${key}/icon`);
      }
    }),
    ...INITIAL_CARDBACK_PRESETS.map(async ({ key }) => {
      const current = await ctx.db
        .query('cardback_presets')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique();
      if (!current) {
        const source = await rawCardbackPreset(ctx, key, true);
        await ctx.db.insert('cardback_presets', {
          key,
          cardback: await resolveBackgrounds(ctx, source.cardback),
          revision: 1,
          updated_at,
        });
        imported.push(`back/${key}`);
      }
    }),
    ...DISCOVERY_FAMILIES.map(async (family) => {
      const current = await ctx.db
        .query('discovery_presets')
        .withIndex('by_key', (q) => q.eq('key', family.key))
        .unique();
      if (!current) {
        const source = await rawDiscoveryPreset(ctx, family, true);
        if (!source) {
          throw new ConvexError('Choose an existing Discovery design before importing presets.');
        }
        await ctx.db.insert('discovery_presets', {
          ...(await resolveBackgrounds(ctx, source)),
          revision: 1,
          updated_at,
        });
        imported.push(`${family.key}/front`, `${family.key}/back`);
      }
    }),
  ]);
  const backgrounds = await materializeBackgrounds(ctx, updated_at);
  await queueBackgroundRecaptures(ctx, [...imported, ...backgrounds]);
}

async function materializeBackgrounds(ctx: MutationCtx, updated_at: number) {
  const library = await listBackgroundPresets(ctx);
  const missing = (
    await Promise.all(
      library.map(async (preset) => {
        const current = await ctx.db
          .query('background_presets')
          .withIndex('by_key', (q) => q.eq('key', preset.key))
          .unique();
        return current ? null : preset;
      })
    )
  ).filter((preset) => preset !== null);
  await assertBackgroundCapacity(ctx, missing.length);
  await Promise.all(
    missing.map((preset) =>
      ctx.db.insert('background_presets', {
        ...preset,
        value: backgroundValue(preset.value),
        revision: 1,
        updated_at,
      })
    )
  );
  return missing.map((preset) => preset.key);
}
