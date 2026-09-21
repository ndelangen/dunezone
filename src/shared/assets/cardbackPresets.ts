import { z } from 'zod';

import { cardbackPresetKeySchema } from './cardbackPresetKeys';
import { CardBack } from './schema';

/** Initial authored designs. Persisted edits replace these values; existing decks are never matched by appearance. */
export const INITIAL_CARDBACK_PRESETS = [
  {
    key: 'treachery',
    label: 'Treachery',
    cardback: {
      name: 'Treachery',
      background: {
        image: '/image/texture/082.jpg',
        colors: ['#8F2C1C', '#621D1A'],
        influence: 0.5,
        invert: false,
        definition: 1,
      },
      image: '/vector/icon/projectile.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
  {
    key: 'spice',
    label: 'Spice',
    cardback: {
      name: 'Spice',
      background: {
        image: '/image/texture/082.jpg',
        colors: ['#474620', '#27260C'],
        influence: 0.6,
        invert: false,
        definition: 1,
      },
      image: '/vector/icon/eye.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
  {
    key: 'traitor',
    label: 'Traitor',
    cardback: {
      name: 'Traitor',
      background: {
        image: '/image/texture/082.jpg',
        colors: ['#29335E', '#0A153C'],
        influence: 0.6,
        invert: false,
        definition: 1,
      },
      image: '/vector/icon/traitor.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
  {
    key: 'alliance',
    label: 'Alliance',
    cardback: {
      name: 'Alliance',
      background: {
        image: '/image/texture/082.jpg',
        colors: ['#4D4724', '#302B16'],
        influence: 0.5,
        invert: false,
        definition: 1,
      },
      image: '/vector/icon/alliance.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
] satisfies { key: z.infer<typeof cardbackPresetKeySchema>; label: string; cardback: z.infer<typeof CardBack> }[];

export const cardbackPresetSchema = z.object({
  key: cardbackPresetKeySchema,
  label: z.string(),
  cardback: CardBack,
  revision: z.number().int().nonnegative(),
  href: z.string().nullable(),
  captureStatus: z.enum(['scheduled', 'in_progress', 'error']).nullable(),
});
export type CardbackPreset = z.infer<typeof cardbackPresetSchema>;
