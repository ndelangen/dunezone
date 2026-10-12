import type { z } from 'zod';

import type { CardBack, StormCardAsset } from './schema';

const background = {
  image: '/image/texture/082.jpg',
  colors: ['#7A3A07', '#3F1D03'],
  influence: 0.6,
  invert: false,
  definition: 1,
} as const;

/** Storm cards share one fixed head and symbol; saved styling fields remain compatible. */
export const STORM_CARD_HEAD: z.infer<typeof StormCardAsset>['head'] = {
  ...background,
  colors: [...background.colors],
};
export const STORM_CARD_ICON: z.infer<typeof StormCardAsset>['icon'] = [
  { ...background, colors: ['#E9C55B', '#B9922D'], influence: 0.4 },
  '/vector/icon/storrm_standalone.svg',
];

/** The six standard cards share editable artwork and rules, with movement rendered from sectors. */
export function standardStormCard(sectors: number): z.infer<typeof StormCardAsset> {
  return {
    name: `${sectors} ${sectors === 1 ? 'Sector' : 'Sectors'}`,
    subName: 'Storm',
    sectors,
    format: 'decal-window',
    about: '',
    head: STORM_CARD_HEAD,
    icon: STORM_CARD_ICON,
    layers: [
      {
        kind: 'decal',
        layerId: '30000000-3000-4000-8000-300000000001',
        id: '/vector/decal/storm-standard-multicolor.svg',
        offset: [0, -161.5],
        scale: 1.75,
        muted: false,
        outline: false,
        behindFrame: true,
        opacity: 1,
        rotation: 0,
      },
      {
        kind: 'text',
        layerId: '30000000-3000-4000-8000-300000000002',
        content:
          'All spice & forces in sectors passed over or covered by the storm in sand territories will be destroyed.',
        offset: [-370, 197],
        width: 734,
        height: 245,
        size: 46.5,
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
  background: { ...background, colors: ['#7A4120', '#3F200D'] },
  image: '/vector/icon/storrm_standalone.svg',
  imageScale: 0.72,
  imageOffset: [0, 18],
};
