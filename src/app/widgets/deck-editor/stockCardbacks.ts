import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import type { CardBack } from '@shared/assets/schema';
import type { z } from 'zod';
export type CardbackData = z.infer<typeof CardBack>;
export const STOCK_CARDBACKS = INITIAL_CARDBACK_PRESETS;
