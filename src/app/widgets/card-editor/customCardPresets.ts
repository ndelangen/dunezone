import type { CustomCardAsset, CustomCardLayer } from '@shared/assets/schema';
import type { z } from 'zod';

import { backgroundPresets } from '@game/data/backgrounds';

export type CustomCardDraft = z.infer<typeof CustomCardAsset>;
export type CardLayer = z.infer<typeof CustomCardLayer>;

/** Starts a text box in the chosen frame's Body. Offsets use the card centre. */
export function newCardText(
  format: CustomCardDraft['format'],
  layerId = crypto.randomUUID()
): Extract<CardLayer, { kind: 'text' }> {
  return {
    kind: 'text',
    layerId,
    content: '',
    offset: [-361, format === 'plain' ? -331.5 : 72.5],
    width: 734,
    height: format === 'plain' ? 903 : 499,
    size: 40,
    font: 'C_Candara',
    color: '#0b0503',
    align: 'left',
    opacity: 1,
    rotation: 0,
  };
}
export function newCardDecal(layerId = crypto.randomUUID()): Extract<CardLayer, { kind: 'decal' }> {
  return {
    kind: 'decal',
    layerId,
    id: '/vector/icon/projectile.svg',
    offset: [0, -161.5],
    scale: 1,
    muted: false,
    outline: true,
    opacity: 1,
    rotation: 0,
  };
}

export const CUSTOM_CARD_PRESETS = [
  {
    key: 'treachery',
    label: 'Treachery',
    format: 'decal-window',
    layers: [
      newCardDecal('10000000-1000-4000-8000-100000000001'),
      {
        ...newCardText('decal-window', '10000000-1000-4000-8000-100000000002'),
        content: 'Write the card text here.',
      },
    ],
  },
  {
    key: 'full-text',
    label: 'Full text',
    format: 'plain',
    layers: [{ ...newCardText('plain', '10000000-1000-4000-8000-100000000001'), content: 'Write the card text here.' }],
  },
  { key: 'blank-window', label: 'Blank with decal window', format: 'decal-window', layers: [] },
  { key: 'blank-plain', label: 'Blank plain', format: 'plain', layers: [] },
] satisfies { key: string; label: string; format: CustomCardDraft['format']; layers: CardLayer[] }[];

export const INITIAL_CUSTOM_CARD_DRAFT: CustomCardDraft = {
  name: '',
  subName: '',
  about: '',
  head: backgroundPresets.special,
  icon: [backgroundPresets.stripedSpecial, '/vector/icon/karama.svg'],
  format: 'decal-window',
  layers: [],
};
