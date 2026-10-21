import { z } from 'zod';

import { assetCaptureStatusSchema } from '../asset-publishing/captureStatus';
import newBacks from '../backgrounds/card-back-defaults.json';
import { cardbackPresetKeySchema } from './cardbackPresetKeys';
import type { CardbackPresetKey } from './cardbackPresetKeys';
import { CardBack } from './schema';
import { STANDARD_STORM_CARDBACK } from './standardStormDeck';

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
  {
    key: 'prediction',
    label: 'Prediction',
    colors: ['#4B2A5E', '#2A153C'],
    image: '/vector/icon/fate.svg',
    influence: 0.5,
  },
] satisfies {
  key: z.infer<typeof cardbackPresetKeySchema>;
  label: string;
  colors: [string, string];
  image: z.infer<typeof CardBack>['image'];
  influence: number;
}[];

export const INITIAL_CARDBACK_PRESETS = [
  ...INITIAL_DESIGNS.map(
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
  ),
  ...newBacks.map((preset) => ({
    key: cardbackPresetKeySchema.parse(preset.key),
    label: preset.label,
    cardback: CardBack.parse(preset.cardback),
  })),
  {
    key: 'custom' as const,
    label: 'Custom',
    cardback: {
      name: 'Custom',
      background: {
        image: '/image/texture/082.jpg' as const,
        colors: ['#474620', '#27260C'] as [string, string],
        influence: 0.6,
        invert: false,
        definition: 1,
      },
      image: '/vector/icon/karama.svg' as const,
      imageScale: 0.55,
      imageOffset: [0, 10] as [number, number],
    },
  },
  { key: 'storm' as const, label: 'Storm', cardback: STANDARD_STORM_CARDBACK },
];

/**
 * A preset's fixed label, the word its initial design prints across the back.
 * An Administrator's edit to the printed word does not change it.
 */
export function cardbackPresetLabel(key: CardbackPresetKey) {
  return INITIAL_CARDBACK_PRESETS.find((preset) => preset.key === key)!.label;
}

export const cardbackPresetSchema = z.object({
  key: cardbackPresetKeySchema,
  label: z.string(),
  cardback: CardBack,
  revision: z.number().int().nonnegative(),
  href: z.string().nullable(),
  captureStatus: assetCaptureStatusSchema.nullable(),
});
export type CardbackPreset = z.infer<typeof cardbackPresetSchema>;
