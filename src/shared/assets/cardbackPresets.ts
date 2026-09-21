import { z } from 'zod';

import { cardbackPresetKeySchema } from './cardbackPresetKeys';
import { CardBack } from './schema';

/** Initial authored designs. Persisted edits replace these values; existing decks are never matched by appearance. */
const INITIAL_DESIGNS = [
  {
    key: 'treachery',
    label: 'Treachery',
    colors: ['#8F2C1C', '#621D1A'],
    image: '/vector/icon/projectile.svg',
    influence: 0.5,
  },
  { key: 'spice', label: 'Spice', colors: ['#474620', '#27260C'], image: '/vector/icon/eye.svg', influence: 0.6 },
  {
    key: 'traitor',
    label: 'Traitor',
    colors: ['#29335E', '#0A153C'],
    image: '/vector/icon/traitor.svg',
    influence: 0.6,
  },
  {
    key: 'alliance',
    label: 'Alliance',
    colors: ['#4D4724', '#302B16'],
    image: '/vector/icon/alliance.svg',
    influence: 0.5,
  },
] satisfies {
  key: z.infer<typeof cardbackPresetKeySchema>;
  label: string;
  colors: [string, string];
  image: z.infer<typeof CardBack>['image'];
  influence: number;
}[];

export const INITIAL_CARDBACK_PRESETS = INITIAL_DESIGNS.map(
  ({ key, label, colors, image, influence }): Pick<CardbackPreset, 'key' | 'label' | 'cardback'> => ({
    key,
    label,
    cardback: {
      name: label,
      background: { image: '/image/texture/082.jpg', colors, influence, invert: false, definition: 1 },
      image,
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  })
);

export const cardbackPresetSchema = z.object({
  key: cardbackPresetKeySchema,
  label: z.string(),
  cardback: CardBack,
  revision: z.number().int().nonnegative(),
  href: z.string().nullable(),
  captureStatus: z.enum(['scheduled', 'in_progress', 'error']).nullable(),
});
export type CardbackPreset = z.infer<typeof cardbackPresetSchema>;
