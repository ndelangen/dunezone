import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { INITIAL_CARD_FRONT_PRESETS } from '../../src/shared/assets/cardFrontPresets';
import { INITIAL_DISCOVERY_PRESETS } from '../../src/shared/backgrounds/families';
import type { BackgroundData } from '../../src/shared/backgrounds/schema';
import { internal } from '../_generated/api';
import type { MutationCtx } from '../types';
import { MAX_BACKGROUND_PRESETS } from './backgroundPresets';
import { rawCardbackPreset } from './cardPresetDefaults';

/** Follow standard slots as well as authored assets; a slot may itself use another named background. */
export async function queueBackgroundRecaptures(ctx: MutationCtx, changed: readonly string[]) {
  const keys = new Set(changed);
  const shadowed = new Set(
    (await ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS + 1)).map((row) => row.key)
  );
  const slots: { key: string; value: BackgroundData; family?: string; back?: string }[] = [];
  for (const initial of INITIAL_CARD_FRONT_PRESETS) {
    const row = await ctx.db
      .query('card_front_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique();
    const style = row?.style ?? initial.style;
    slots.push({ key: `front/${initial.key}/header`, value: style.head, family: initial.key });
    if (style.iconBackground) {
      slots.push({ key: `front/${initial.key}/icon`, value: style.iconBackground, family: initial.key });
    }
  }
  for (const initial of INITIAL_CARDBACK_PRESETS) {
    const row = await rawCardbackPreset(ctx, initial.key);
    slots.push({ key: `back/${initial.key}`, value: row.cardback.background, back: initial.key });
  }
  for (const initial of INITIAL_DISCOVERY_PRESETS) {
    const row = await ctx.db
      .query('discovery_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique();
    for (const face of ['front', 'back'] as const) {
      slots.push({ key: `${initial.key}/${face}`, value: (row ?? initial)[face].background });
    }
  }
  const families = new Map<string, Set<string>>(),
    backs = new Set<string>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const slot of slots) {
      const source = slot.value.source;
      const used = source?.kind === 'preset' ? source.key : source?.kind === 'custom' ? null : slot.key;
      if (used && keys.has(used)) {
        if (slot.family) {
          const regions = families.get(slot.family) ?? new Set<string>();
          regions.add(slot.key.endsWith('/header') ? 'header' : 'icon');
          families.set(slot.family, regions);
        }
        if (slot.back) {
          backs.add(slot.back);
        }
        if (!shadowed.has(slot.key) && !keys.has(slot.key)) {
          keys.add(slot.key);
          expanded = true;
        }
      }
    }
  }
  for (const key of keys) {
    await ctx.scheduler.runAfter(0, internal.backgroundPresets.recapture, { key, cursor: null });
  }
  for (const [key, regions] of families) {
    await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
      key,
      regions: [...regions] as ('header' | 'icon')[],
      cursor: null,
    });
  }
  for (const key of backs) {
    await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureBack, { key });
  }
}
