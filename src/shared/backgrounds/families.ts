import { z } from 'zod';

import { cardbackPresetKeySchema } from '../assets/cardbackPresetKeys';
import { authoredCardFrontStyleSchema, cardFrontPresetKeySchema } from '../assets/cardFrontPresets';
import { CardBack, TokenFace } from '../assets/schema';
import discoveryDefaults from './discovery-defaults.json';
import { backgroundPresetSchema } from './schema';

export const discoveryKeySchema = z.enum(['discovery-hiereg', 'discovery-smuggler']);
export const discoveryPresetSchema = z.strictObject({
  key: discoveryKeySchema,
  label: z.string(),
  front: TokenFace,
  back: TokenFace,
  revision: z.number().int().nonnegative(),
});
export const INITIAL_DISCOVERY_PRESETS = discoveryDefaults.map((value) => discoveryPresetSchema.parse(value));
export type DiscoveryPreset = z.infer<typeof discoveryPresetSchema>;
export const familyPresetSchema = z.strictObject({
  key: cardFrontPresetKeySchema,
  label: z.string(),
  style: authoredCardFrontStyleSchema,
  frontRevision: z.number().int().nonnegative(),
  backKey: cardbackPresetKeySchema,
  cardback: CardBack,
  backRevision: z.number().int().nonnegative(),
});
export type FamilyPreset = z.infer<typeof familyPresetSchema>;
const editedBackgrounds = z
  .array(backgroundPresetSchema)
  .refine(
    (presets) => new Set(presets.map((preset) => preset.key)).size === presets.length,
    'Choose each background only once.'
  );
export const familySaveSchema = familyPresetSchema.extend({ backgrounds: editedBackgrounds.max(3) });
export const discoverySaveSchema = discoveryPresetSchema.extend({
  backgrounds: editedBackgrounds.max(2),
});
