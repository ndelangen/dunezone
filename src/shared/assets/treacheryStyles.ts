import type { z } from 'zod';

import type { Background } from '../factions/schema';
import type { Treachery } from './schema';

/* Historic category values stay independent of Administrator edits. */
export const TREACHERY_BACKGROUNDS = {
  weapon: {
    image: '/image/texture/082.jpg',
    colors: ['#8F2C1C', '#621D1A'],
    influence: 0.5,
    invert: false,
    definition: 1,
  },
  defense: {
    image: '/image/texture/082.jpg',
    colors: ['#29335E', '#0A153C'],
    influence: 0.6,
    invert: false,
    definition: 1,
  },
  special: {
    image: '/image/texture/082.jpg',
    colors: ['#474620', '#27260C'],
    influence: 0.6,
    invert: false,
    definition: 1,
  },
  worthless: {
    image: '/image/texture/082.jpg',
    colors: ['#887849', '#6F6034'],
    influence: 0.8,
    invert: false,
    definition: 1,
  },
  stripedWeapon: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#CB8E4A', 0],
          ['#F3E086', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#CD7B38', 0.3],
          ['#E9CA70', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  stripedDefense: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#757DAC', 0],
          ['#CEDDF0', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#58608F', 0.3],
          ['#B8BFDB', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  stripedSpecial: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#9A9256', 0],
          ['#EEECA6', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#827E43', 0.3],
          ['#DEDB91', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  stripedWorthless: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#A9945D', 0],
          ['#F5EFB4', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#997E45', 0.3],
          ['#D9CC91', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
} satisfies Record<string, z.infer<typeof Background>>;

export const TREACHERY_STYLES = [
  { key: 'weapon', label: 'Weapon', head: TREACHERY_BACKGROUNDS.weapon, striped: TREACHERY_BACKGROUNDS.stripedWeapon },
  {
    key: 'defense',
    label: 'Defense',
    head: TREACHERY_BACKGROUNDS.defense,
    striped: TREACHERY_BACKGROUNDS.stripedDefense,
  },
  {
    key: 'special',
    label: 'Special',
    head: TREACHERY_BACKGROUNDS.special,
    striped: TREACHERY_BACKGROUNDS.stripedSpecial,
  },
  {
    key: 'worthless',
    label: 'Worthless',
    head: TREACHERY_BACKGROUNDS.worthless,
    striped: TREACHERY_BACKGROUNDS.stripedWorthless,
  },
] as const;

/* Historic colours classify saved cards before the printed type supplies the fallback. */
export function treacheryStyle(card: Pick<z.infer<typeof Treachery>, 'head' | 'subName'>) {
  return (
    TREACHERY_STYLES.find((style) => JSON.stringify(style.head.colors) === JSON.stringify(card.head.colors)) ??
    TREACHERY_STYLES.find((style) => card.subName.toLowerCase().startsWith(style.key)) ??
    TREACHERY_STYLES[0]
  );
}
