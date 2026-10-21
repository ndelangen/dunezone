import { ConvexError } from 'convex/values';

import { INITIAL_BACKGROUND_PRESETS } from '../../src/shared/backgrounds/defaults';
import {
  backgroundPresetKeys,
  resolveBackgroundValues,
  backgroundValue,
  customBackground,
  mapBackgrounds,
} from '../../src/shared/backgrounds/schema';
import type { SharedBackgroundPreset, BackgroundData } from '../../src/shared/backgrounds/schema';
import type { MutationCtx, QueryCtx } from '../types';
import { backgroundSlotFor, backgroundSlots } from './backgroundPresetSlots';
import { canonicalJson } from './canonicalJson';

export const MAX_BACKGROUND_PRESETS = 200;
type Reader = Pick<QueryCtx, 'db'>;

/** Saved card standards remain the fallback until an administrator explicitly saves a named background. */
export async function listBackgroundPresets(ctx: Reader): Promise<SharedBackgroundPreset[]> {
  const [slots, stored] = await Promise.all([
    backgroundSlots(ctx),
    ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS + 1),
  ]);
  const projected = await Promise.all(
    slots.map(async (slot) => ({
      key: slot.key,
      name: slot.name,
      value: await resolveBackgrounds(ctx, slot.value),
      revision: slot.revision,
    }))
  );
  const overrides = stored.map(({ key, name, value, revision }) => ({ key, name, value, revision }));
  return [
    ...new Map(
      [...INITIAL_BACKGROUND_PRESETS, ...projected, ...overrides].map((preset) => [preset.key, preset])
    ).values(),
  ];
}

async function followSlot(
  ctx: Reader,
  key: string,
  value: BackgroundData,
  ancestors: Set<string>
): Promise<BackgroundData> {
  const source = value.source;
  if (source?.kind !== 'preset' || source.key === key) {
    return backgroundValue(value);
  }
  if (ancestors.has(key)) {
    throw new ConvexError('These preset choices form a loop. Choose a background with its own settings.');
  }
  const target = await referencedPreset(ctx, source.key, new Set([...ancestors, key]));
  return target?.value ?? backgroundValue(value);
}

/** Capture reads follow only the keys they use, rather than loading the entire admin library for each face. */
async function referencedPreset(
  ctx: Reader,
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
  const slot = await backgroundSlotFor(ctx, key);
  if (!slot) {
    return null;
  }
  return { key, name: slot.name, value: await followSlot(ctx, key, slot.value, ancestors), revision: slot.revision };
}

/** Only the values a render projection references cross the page query. The Picker loads its options separately. */
export async function backgroundProjection(ctx: Reader, data: unknown): Promise<SharedBackgroundPreset[]> {
  const presets = await Promise.all(backgroundPresetKeys(data).map((key) => referencedPreset(ctx, key)));
  return presets.filter((preset) => preset !== null);
}

export async function resolveBackgrounds<T>(ctx: Reader, value: T, keepSource = false): Promise<T> {
  return resolveBackgroundValues(value, await backgroundProjection(ctx, value), keepSource);
}

function assertFamilySource(value: BackgroundData, path: string[], allowCardFamily: boolean) {
  if (value.source?.kind !== 'family') {
    return;
  }
  const region = path.join('.');
  if (!allowCardFamily || !['head', 'icon.0'].includes(region)) {
    throw new ConvexError('Family standard is available only for a card header or icon background.');
  }
}
export async function validateBackgroundLinks(ctx: Reader, value: unknown, allowCardFamily = false) {
  mapBackgrounds(value, (background, path) => {
    assertFamilySource(background, path, allowCardFamily);
    return background;
  });
  const keys = backgroundPresetKeys(value);
  const found = await backgroundProjection(ctx, value);
  if (found.length !== keys.length) {
    throw new ConvexError('A selected background no longer exists. Choose another preset.');
  }
}

export async function assertBackgroundCapacity(ctx: Reader, additional = 0) {
  const rows = await ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS + 1);
  if (rows.length + additional > MAX_BACKGROUND_PRESETS) {
    throw new ConvexError('The background library is full. Edit an existing preset.');
  }
}

async function unmaterializedPreset(ctx: Reader, library: SharedBackgroundPreset[], key: string) {
  const row = await ctx.db
    .query('background_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return row ? undefined : library.find((preset) => preset.key === key);
}

/** Keep named definitions stable before a family slot stops supplying their virtual fallback. */
export async function preserveVirtualBackgrounds(ctx: MutationCtx, keys: string[]) {
  if (keys.length === 0) {
    return;
  }
  const library = await listBackgroundPresets(ctx);
  const candidates = await Promise.all([...new Set(keys)].map((key) => unmaterializedPreset(ctx, library, key)));
  const missing = candidates.filter((preset) => preset !== undefined);
  await assertBackgroundCapacity(ctx, missing.length);
  await Promise.all(
    missing.map((preset) => ctx.db.insert('background_presets', { ...preset, updated_at: Date.now() }))
  );
}

export function legacyBackground(
  value: BackgroundData,
  current: BackgroundData,
  resolved: BackgroundData,
  key: string
): BackgroundData {
  if (value.source) {
    return value;
  }
  if (canonicalJson(backgroundValue(value)) !== canonicalJson(backgroundValue(resolved))) {
    return customBackground(value);
  }
  return current.source ? current : { ...current, source: { kind: 'preset', key } };
}
