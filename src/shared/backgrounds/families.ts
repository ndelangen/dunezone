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
export const familySaveSchema = familyPresetSchema.extend({ backgrounds: z.array(backgroundPresetSchema).max(3) });
export const discoverySaveSchema = discoveryPresetSchema.extend({
  backgrounds: z.array(backgroundPresetSchema).max(2),
});
