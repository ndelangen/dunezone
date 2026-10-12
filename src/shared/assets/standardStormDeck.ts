import type { z } from 'zod';

import type { CardBack, StormCardAsset } from './schema';

const background = {
  image: '/image/texture/082.jpg',
  colors: ['#474620', '#27260C'],
  influence: 0.6,
  invert: false,
  definition: 1,
} as const;

/** The six standard cards share editable artwork and rules, with movement rendered from sectors. */
export function standardStormCard(sectors: number): z.infer<typeof StormCardAsset> {
  return {
    name: `${sectors} ${sectors === 1 ? 'Sector' : 'Sectors'}`,
    subName: 'Storm',
    sectors,
    format: 'decal-window',
    about: '',
    head: { ...background, colors: [...background.colors] },
    icon: [{ ...background, colors: ['#E9C55B', '#B9922D'], influence: 0.4 }, '/vector/icon/storm_disc.svg'],
    layers: [
      {
        kind: 'decal',
        layerId: '30000000-3000-4000-8000-300000000001',
        id: '/vector/decal/storm.svg',
        offset: [0, -161.5],
        scale: 1.74,
        muted: true,
        outline: false,
        behindFrame: true,
        opacity: 1,
        rotation: 0,
      },
      {
        kind: 'text',
        layerId: '30000000-3000-4000-8000-300000000002',
        content:
          'The storm destroys spice and forces in the sand sectors it crosses or covers. Apply faction abilities and protected-territory rules.',
        offset: [-361, 205],
        width: 734,
        height: 245,
        size: 40,
        font: 'C_Candara',
        color: '#0b0503',
        align: 'left',
        opacity: 0.937,
        rotation: 0,
      },
    ],
  };
}

export const STANDARD_STORM_CARDS = [1, 2, 3, 4, 5, 6].map(standardStormCard);
export const STANDARD_STORM_CARDBACK: z.infer<typeof CardBack> = {
  name: 'Storm',
  background: { ...background, colors: [...background.colors] },
  image: '/vector/icon/storm_disc.svg',
  imageScale: 0.55,
  imageOffset: [0, 10],
};
