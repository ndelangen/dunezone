import type { TTSColor } from '@shared/factions/schema';
import type { z } from 'zod';

type TtsColor = z.infer<typeof TTSColor>;

// https://api.tabletopsimulator.com/player/colors/
export const TTS_COLOR_SWATCHES = {
  White: 'rgb(100% 100% 100%)',
  Brown: 'rgb(44.3% 23.1% 9%)',
  Red: 'rgb(85.6% 10% 9.4%)',
  Orange: 'rgb(95.6% 39.2% 11.3%)',
  Yellow: 'rgb(90.5% 89.8% 17.2%)',
  Green: 'rgb(19.2% 70.1% 16.8%)',
  Teal: 'rgb(12.9% 69.4% 60.7%)',
  Blue: 'rgb(11.8% 53% 100%)',
  Purple: 'rgb(62.7% 12.5% 94.1%)',
  Pink: 'rgb(96% 43.9% 80.7%)',
} as const satisfies Record<TtsColor, string>;
