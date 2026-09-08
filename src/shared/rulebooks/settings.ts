import { z } from 'zod';

/** Physical Page dimensions shared by authoring, reading, and publication. */
export const rulebookSizeCatalogue = [
  { id: 'square', label: 'Square', widthMm: 255, heightMm: 254 },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'tall', label: 'Tall', widthMm: 105, heightMm: 297 },
] as const;

export const rulebookDesignCatalogue = [
  { id: 'illustrated', label: 'Illustrated classic' },
  { id: 'restrained', label: 'Restrained expansion' },
] as const;

export const rulebookSizeSchema = z.enum(rulebookSizeCatalogue.map(({ id }) => id));
export const rulebookDesignSchema = z.enum(rulebookDesignCatalogue.map(({ id }) => id));
export const rulebookSettingsSchema = z.strictObject({
  size: rulebookSizeSchema,
  design: rulebookDesignSchema,
});

export type RulebookSize = z.infer<typeof rulebookSizeSchema>;
export type RulebookDesign = z.infer<typeof rulebookDesignSchema>;
export type RulebookSettings = z.infer<typeof rulebookSettingsSchema>;

export const DEFAULT_RULEBOOK_SETTINGS: Readonly<RulebookSettings> = {
  size: 'a4',
  design: 'illustrated',
};

export function getRulebookSize(size: RulebookSize) {
  return rulebookSizeCatalogue.find((entry) => entry.id === size)!;
}
