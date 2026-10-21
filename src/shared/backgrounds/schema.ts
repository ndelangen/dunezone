import { z } from 'zod';

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

/** Raw editor values retain their links; only the returned render projection follows the library. */
export function resolveBackgroundValues<T>(data: T, presets: readonly SharedBackgroundPreset[], keepSource = false): T {
  const values = new Map(presets.map((entry) => [entry.key, entry.value]));
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    if ('colors' in value && 'image' in value) {
      const parsed = AuthoredBackground.safeParse(value);
      if (parsed.success) {
        const source = parsed.data.source;
        const resolved =
          source?.kind === 'preset'
            ? (values.get(source.key) ?? backgroundValue(parsed.data))
            : backgroundValue(parsed.data);
        return keepSource && source ? { ...resolved, source } : resolved;
      }
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
  };
  return visit(data) as T;
}

/** One edge per subject and preset, even when several regions share the same definition. */
export function backgroundPresetKeys(data: unknown): string[] {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const background = 'colors' in value && 'image' in value ? AuthoredBackground.safeParse(value) : null;
    if (background?.success && background.data.source?.kind === 'preset') {
      keys.add(background.data.source.key);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(data);
  return [...keys].sort();
}
