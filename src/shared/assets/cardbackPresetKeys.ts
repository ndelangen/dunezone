import { z } from 'zod';

const CARDBACK_PRESET_KEYS = ['treachery', 'spice', 'traitor', 'alliance'] as const;
export const cardbackPresetKeySchema = z.enum(CARDBACK_PRESET_KEYS);
export type CardbackPresetKey = z.infer<typeof cardbackPresetKeySchema>;
