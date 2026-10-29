import { z } from 'zod';

import { compareCodeUnits } from '../compareText';
import { AuthoredBackground, Background } from '../factions/schema';
import { backgroundPresetKeySchema } from './source';

export type BackgroundData = z.infer<typeof AuthoredBackground>;
export const backgroundPresetSchema = z.strictObject({
  key: backgroundPresetKeySchema,
  name: z.string().trim().min(1).max(100),
  value: Background,
  revision: z.number().int().nonnegative(),
});
export type SharedBackgroundPreset = z.infer<typeof backgroundPresetSchema>;

export function customBackground(value: BackgroundData): BackgroundData {
  return { ...value, source: { kind: 'custom' } };
}
export function linkedBackground(preset: SharedBackgroundPreset): BackgroundData {
  return { ...preset.value, source: { kind: 'preset', key: preset.key } };
}
export function backgroundValue(value: BackgroundData): z.infer<typeof Background> {
  const { source: _source, ...pure } = value;
  return pure;
}

/** Apply a projection only at complete authored backgrounds, preserving every other data field. */
export function mapBackgrounds<T>(data: T, project: (background: BackgroundData, path: string[]) => unknown): T {
  function visit(value: unknown, path: string[]): unknown {
    if (Array.isArray(value)) {
      return value.map((entry, index) => visit(entry, [...path, String(index)]));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const parsed = 'colors' in value && 'image' in value ? AuthoredBackground.safeParse(value) : null;
    if (parsed?.success) {
      return project(parsed.data, path);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry, [...path, key])]));
  }
  return visit(data, []) as T;
}

function projectedBackground(
  value: BackgroundData,
  values: Map<string, SharedBackgroundPreset['value']>,
  keepSource: boolean
) {
  const source = value.source;
  let resolved = backgroundValue(value);
  if (source?.kind === 'preset') {
    resolved = values.get(source.key) ?? resolved;
  }
  return keepSource && source ? { ...resolved, source } : resolved;
}

/** Raw editor values retain their links; only the returned render projection follows the library. */
export function resolveBackgroundValues<T>(data: T, presets: readonly SharedBackgroundPreset[], keepSource = false): T {
  const values = new Map(presets.map((entry) => [entry.key, entry.value]));
  return mapBackgrounds(data, (value) => projectedBackground(value, values, keepSource));
}

/** One edge per subject and preset, even when several regions share the same definition. */
export function backgroundPresetKeys(data: unknown): string[] {
  const keys = new Set<string>();
  mapBackgrounds(data, (value) => {
    if (value.source?.kind === 'preset') {
      keys.add(value.source.key);
    }
    return value;
  });
  return [...keys].sort(compareCodeUnits);
}
