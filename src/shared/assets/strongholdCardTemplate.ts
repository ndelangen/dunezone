import type { z } from 'zod';

import type { Background } from '../factions/schema';
import type { CustomCard, StrongholdCard } from './schema';

/** The stronghold template keeps its Head, symbol, frame and layer positions fixed. */
export const STRONGHOLD_BACKGROUND: z.infer<typeof Background> = {
  image: '/image/texture/082.jpg',
  colors: ['#8D3A38', '#602726'],
  influence: 0.5,
  invert: false,
  definition: 1,
};

/** Builds the constrained face with the same composition renderer used by custom cards. */
export function strongholdCardComposition(value: z.infer<typeof StrongholdCard>): z.infer<typeof CustomCard> {
  const { name, decals, text, textSize } = value;
  const ordered = [...decals.filter((decal) => decal.muted), ...decals.filter((decal) => !decal.muted)];
  const identity = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return {
    name,
    subName: '',
    head: STRONGHOLD_BACKGROUND,
    icon: [
      {
        image: '/image/texture/082.jpg',
        colors: ['#C33D38', '#A22528'],
        influence: 0.5,
        invert: false,
        definition: 1,
      },
      '/vector/icon/stronghold.svg',
    ],
    iconScale: 1.3,
    format: 'decal-window',
    layers: [
      ...ordered.map((decal, index) => ({
        ...decal,
        kind: 'decal' as const,
        layerId: identity(index),
        offset: [decal.offset[0], decal.offset[1] - 161.5] as [number, number],
        opacity: 1,
        rotation: 0,
        behindFrame: true,
      })),
      {
        kind: 'text',
        layerId: identity(ordered.length),
        content: text,
        offset: [-361, 72.5],
        width: 734,
        height: 499,
        size: textSize,
        font: 'C_Candara',
        color: '#0b0503',
        align: 'left',
        opacity: 0.937,
        rotation: 0,
      },
    ],
  };
}
