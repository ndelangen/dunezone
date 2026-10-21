import { ConvexError } from 'convex/values';

import { cardbackPresetKeySchema } from '../../src/shared/assets/cardbackPresetKeys';
import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { cardFrontPresetKeySchema } from '../../src/shared/assets/cardFrontPresets';
import { INITIAL_CARD_FRONT_PRESETS } from '../../src/shared/assets/cardFrontPresets';
import { INITIAL_BACKGROUND_PRESETS } from '../../src/shared/backgrounds/defaults';
import { discoveryKeySchema } from '../../src/shared/backgrounds/families';
import { INITIAL_DISCOVERY_PRESETS } from '../../src/shared/backgrounds/families';
import { backgroundPresetKeys, resolveBackgroundValues } from '../../src/shared/backgrounds/schema';
import type { SharedBackgroundPreset, BackgroundData } from '../../src/shared/backgrounds/schema';
import type { MutationCtx, QueryCtx } from '../types';
import { rawCardbackPreset } from './cardPresetDefaults';

export const MAX_BACKGROUND_PRESETS = 200;

/** Saved card standards remain the fallback until an administrator explicitly saves a named background. */
export async function listBackgroundPresets(ctx: Pick<QueryCtx, 'db'>): Promise<SharedBackgroundPreset[]> {
  const presets = new Map<string, SharedBackgroundPreset>(
    INITIAL_BACKGROUND_PRESETS.map((preset) => [preset.key, preset])
  );
  for (const initial of INITIAL_CARD_FRONT_PRESETS) {
    const row = await ctx.db
      .query('card_front_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique();
    const style = row?.style ?? initial.style;
    for (const [region, value] of Object.entries(style)) {
      if (value) {
        presets.set(`front/${initial.key}/${region === 'head' ? 'header' : 'icon'}`, {
          key: `front/${initial.key}/${region === 'head' ? 'header' : 'icon'}`,
          name: `${initial.label} ${region === 'head' ? 'header' : 'icon'}`,
          value: await resolveBackgrounds(ctx, value),
          revision: row?.revision ?? 0,
        });
      }
    }
  }
  for (const initial of INITIAL_CARDBACK_PRESETS) {
    const row = await rawCardbackPreset(ctx, initial.key);
    presets.set(`back/${initial.key}`, {
      key: `back/${initial.key}`,
      name: `${initial.label} back`,
      value: await resolveBackgrounds(ctx, row.cardback.background),
      revision: row?.revision ?? 0,
    });
  }
  for (const initial of INITIAL_DISCOVERY_PRESETS) {
    const row = await ctx.db
      .query('discovery_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique();
    for (const face of ['front', 'back'] as const) {
      presets.set(`${initial.key}/${face}`, {
        key: `${initial.key}/${face}`,
        name: `${initial.label} ${face}`,
        value: await resolveBackgrounds(ctx, (row ?? initial)[face].background),
        revision: row?.revision ?? 0,
      });
    }
  }
  for (const row of await ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS + 1)) {
    presets.set(row.key, { key: row.key, name: row.name, value: row.value, revision: row.revision });
  }
  return [...presets.values()];
}

/** Capture reads follow only the keys they use, rather than loading the entire admin library for each face. */
async function referencedPreset(
  ctx: Pick<QueryCtx, 'db'>,
  key: string,
  ancestors = new Set<string>()
): Promise<SharedBackgroundPreset | null> {
  const stored = await ctx.db
    .query('background_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (stored) {
    return { key, name: stored.name, value: stored.value, revision: stored.revision };
  }
  const stock = INITIAL_BACKGROUND_PRESETS.find((preset) => preset.key === key);
  if (stock) {
    return stock;
  }
  const [kind, family, region] = key.split('/');
  let value: BackgroundData | undefined;
  let revision = 0;
  if (kind === 'front') {
    const parsed = cardFrontPresetKeySchema.safeParse(family);
    if (parsed.success && (region === 'header' || region === 'icon')) {
      const row = await ctx.db
        .query('card_front_presets')
        .withIndex('by_key', (q) => q.eq('key', parsed.data))
        .unique();
      const style = row?.style ?? INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === parsed.data)!.style;
      value = (region === 'header' ? style.head : style.iconBackground) ?? undefined;
      revision = row?.revision ?? 0;
    }
  } else if (kind === 'back') {
    const parsed = cardbackPresetKeySchema.safeParse(family);
    if (parsed.success) {
      const row = await rawCardbackPreset(ctx, parsed.data);
      value = row.cardback.background;
      revision = row.revision;
    }
  } else {
    const parsed = discoveryKeySchema.safeParse(kind);
    if (parsed.success && (family === 'front' || family === 'back')) {
      const row = await ctx.db
        .query('discovery_presets')
        .withIndex('by_key', (q) => q.eq('key', parsed.data))
        .unique();
      const preset = row ?? INITIAL_DISCOVERY_PRESETS.find((preset) => preset.key === parsed.data)!;
      value = preset[family].background;
      revision = preset.revision;
    }
  }
  if (!value) {
    return null;
  }
  if (value.source?.kind === 'preset' && value.source.key !== key) {
    if (ancestors.has(key)) {
      throw new ConvexError('These preset choices form a loop. Choose a background with its own settings.');
    }
    const target = await referencedPreset(ctx, value.source.key, new Set([...ancestors, key]));
    if (target) {
      value = target.value;
    }
  }
  return { key, name: key, value: resolveBackgroundValues(value, []), revision };
}
export async function resolveBackgrounds<T>(ctx: Pick<QueryCtx, 'db'>, value: T, keepSource = false): Promise<T> {
  const presets: SharedBackgroundPreset[] = [];
  for (const key of backgroundPresetKeys(value)) {
    const preset = await referencedPreset(ctx, key);
    if (preset) {
      presets.push(preset);
    }
  }
  return resolveBackgroundValues(value, presets, keepSource);
}

export async function validateBackgroundLinks(ctx: Pick<QueryCtx, 'db'>, value: unknown, allowCardFamily = false) {
  const visit = (entry: unknown, path: string[]) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    if (
      'source' in entry &&
      entry.source &&
      typeof entry.source === 'object' &&
      'kind' in entry.source &&
      entry.source.kind === 'family'
    ) {
      if (!allowCardFamily || (path.join('.') !== 'head' && path.join('.') !== 'icon.0')) {
        throw new ConvexError('Family standard is available only for a card header or icon background.');
      }
    }
    Object.entries(entry).forEach(([key, child]) => visit(child, [...path, key]));
  };
  visit(value, []);
  const keys = backgroundPresetKeys(value);
  if (!keys.length) {
    return;
  }
  const available = new Set((await listBackgroundPresets(ctx)).map((preset) => preset.key));
  if (keys.some((key) => !available.has(key))) {
    throw new ConvexError('A linked background no longer exists. Choose another preset or Custom.');
  }
}

/** Preserve a virtual definition before its old backing slot is rewired to another design. */
export async function preserveVirtualBackgrounds(ctx: MutationCtx, keys: readonly string[]) {
  const library = await listBackgroundPresets(ctx);
  for (const key of keys) {
    const row = await ctx.db
      .query('background_presets')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    const preset = library.find((entry) => entry.key === key);
    if (!row && preset) {
      if ((await ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS)).length >= MAX_BACKGROUND_PRESETS) {
        throw new ConvexError('The background library is full. Edit an existing preset.');
      }
      await ctx.db.insert('background_presets', { ...preset, updated_at: Date.now() });
    }
  }
}
