import { z } from 'zod';

import { SPAWN_TYPES } from '../play/inventory';

/**
 * Faction Extras (#1226, settled in #1021): catalogue references a faction supplies once at setup.
 *
 * A deck or token bundle brings its member counts;
 * a direct token is one piece, so there is no amount field.
 * Missing and empty both mean none.
 * The same schema serves the faction editor, the Convex save and Play's capture.
 */
export const FACTION_EXTRA_TYPES = SPAWN_TYPES;

const factionExtraSchema = z.strictObject({
  type: z.enum(FACTION_EXTRA_TYPES),
  slug: z.string().min(1).max(160),
});
export type FactionExtra = z.infer<typeof factionExtraSchema>;

export function factionExtraKey(extra: FactionExtra): string {
  return `${extra.type}/${extra.slug}`;
}

/** Each reference appears once: a second copy of the same asset belongs in a bundle's counts, not a repeated row. */
export const factionExtrasSchema = z.array(factionExtraSchema).superRefine((extras, ctx) => {
  const seen = new Set<string>();
  extras.forEach((extra, index) => {
    const key = factionExtraKey(extra);
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: [index], message: 'This Extra is already listed.' });
    }
    seen.add(key);
  });
});

/**
 * The retired TTS link lists (`{name, items}`) that `extras` held before #1226.
 * Retained Play games and frozen publications can still carry them, so reads drop them rather than fail;
 * `faction_extras_references_v1` removes them from faction rows.
 */
export function isLegacyFactionExtra(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'items' in value && !('slug' in value);
}

/** Stored-data reader for the compatibility window: legacy link lists read as absent, anything else must be a reference. */
export const storedFactionExtrasSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value.filter((entry) => !isLegacyFactionExtra(entry)) : value),
  factionExtrasSchema
);
