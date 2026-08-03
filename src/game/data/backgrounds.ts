import type { z } from 'zod';

import type { Background } from '../schema/faction';

export type BackgroundData = z.infer<typeof Background>;

/**
 * Authored renderer inputs. These values are source data, never captured output.
 * Components may compose them directly through BackgroundRenderer.
 */
export const backgroundPresets = {
  atreides: {
    image: '/image/texture/015.jpg',
    colors: ['#4B4C0D', '#262B04'],
    influence: 0.5,
    invert: true,
    definition: 0,
  },
  ixian: {
    image: '/image/texture/004.jpg',
    colors: ['#D4BE6B', '#A88E2A'],
    influence: 0.2,
    invert: true,
    definition: 0,
  },
  beneGesserit: {
    image: '/image/texture/020.jpg',
    colors: ['#3A4491', '#101D65'],
    influence: 1,
    invert: false,
    definition: 1,
  },
  beneTleilaxu: {
    image: '/image/texture/031.jpg',
    colors: ['#6E008F', '#2D006B'],
    influence: 1,
    invert: false,
    definition: 0.8,
  },
  emperor: {
    image: '/image/texture/030.jpg',
    colors: ['#A40008', '#8D0006'],
    influence: 0,
    invert: true,
    definition: 0,
  },
  fremen: {
    image: '/image/texture/054.jpg',
    colors: ['#F6A834', '#CF7317'],
    influence: 1,
    invert: false,
    definition: 1,
  },
  guild: {
    image: '/image/texture/007.jpg',
    colors: ['#D83C13', '#B41C0C'],
    influence: 1,
    invert: false,
    definition: 1,
  },
  iduali: {
    image: '/image/texture/009.jpg',
    colors: ['#5B2802', '#470200'],
    influence: 1,
    invert: false,
    definition: 1,
  },
  harkonnen: {
    image: '/image/texture/059.jpg',
    colors: ['#191311', '#000000'],
    influence: 1,
    invert: false,
    definition: 0.1,
  },
  moritani: {
    image: '/image/texture/057.jpg',
    colors: ['#0B4D64', '#05333D'],
    influence: 1,
    invert: false,
    definition: 0.67,
  },
  ginaz: {
    image: '/image/texture/056.jpg',
    colors: ['#425A61', '#273739'],
    influence: 1,
    invert: false,
    definition: 0.1,
  },
  landsraad: {
    image: '/image/texture/036.jpg',
    colors: ['#520E2D', '#410D25'],
    influence: 1,
    invert: false,
    definition: 1,
  },
  richese: {
    image: '/image/texture/029.jpg',
    colors: ['#B5B0A5', '#7C786D'],
    influence: 1,
    invert: false,
    definition: 0.77,
  },
  ecaz: {
    image: '/image/texture/044.jpg',
    colors: ['#7F3D81', '#581858'],
    influence: 1,
    invert: false,
    definition: 0.85,
  },
  choam: {
    image: '/image/texture/075.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#EB0220', 0.5],
          ['#252527', 0.5],
        ],
      },
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#B90010', 0.5],
          ['#0C0C0C', 0.5],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  discovery: {
    image: '/image/texture/052.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#A57B37', 0.35],
          ['#392C1A', 0.35],
          ['#392C1A', 1],
        ],
      },
    ],
    influence: 0.4,
    invert: false,
    definition: 1,
  },
  hiereg: {
    image: '/image/texture/052.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#392C1A', 0.35],
          ['#A57B37', 0.35],
          ['#A57B37', 1],
        ],
      },
    ],
    influence: 0.4,
    invert: false,
    definition: 1,
  },
  terror: {
    image: '/image/texture/038.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#24577A', 0.35],
          ['#418CB1', 0.35],
          ['#66C0EB', 1],
        ],
      },
    ],
    influence: 0.4,
    invert: true,
    definition: 0,
  },
  spiceToken: {
    image: '/image/texture/001.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#DE9E31', 0.35],
          ['#DE9E31', 0.35],
          ['#FCFAAD', 1],
        ],
      },
    ],
    influence: 0.4,
    invert: true,
    definition: 0,
  },
  techTeal: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#C1C091', 0.3],
          ['#8A8B56', 0.3],
          ['#7D7D49', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techPurple: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#79529F', 0.3],
          ['#4F207D', 0.3],
          ['#36165E', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techYellow: {
    image: '/image/texture/003.jpg',
    colors: [
      '#5E3C16',
      {
        type: 'radial',
        stops: [
          ['#E6B05D', 0.3],
          ['#E5A22A', 0.3],
          ['#A46E26', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techRed: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#8D272B', 0.3],
          ['#7E0002', 0.3],
          ['#620003', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techMaroon: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#612A2A', 0.3],
          ['#4C0002', 0.3],
          ['#2E0002', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0.5,
  },
  techOrange: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#D83C13', 0.3],
          ['#B41C0C', 0.3],
          ['#B41C0C', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techBlue: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#3A4491', 0.3],
          ['#101D65', 0.3],
          ['#101D65', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techWhite: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#888888', 0.3],
          ['#333333', 0.3],
          ['#444444', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  techGreen: {
    image: '/image/texture/003.jpg',
    colors: [
      '#000000',
      {
        type: 'radial',
        stops: [
          ['#75A255', 0.3],
          ['#47682C', 0.3],
          ['#4D802F', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  moss: {
    image: '/image/texture/009.jpg',
    colors: ['#4E431D', '#31260D'],
    influence: 1,
    invert: true,
    definition: 0,
  },
  traitor: {
    image: '/image/texture/082.jpg',
    colors: ['#3D3438', '#040404'],
    influence: 0,
    invert: false,
    definition: 1,
  },
  alliance: {
    image: '/image/texture/082.jpg',
    colors: ['#4D4724', '#302B16'],
    influence: 0.5,
    invert: false,
    definition: 1,
  },
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
  storm: {
    image: '/image/texture/082.jpg',
    colors: ['#582705', '#875818'],
    influence: 0.5,
    invert: true,
    definition: 0,
  },
  spice: {
    image: '/image/texture/082.jpg',
    colors: ['#7A4421', '#56210B'],
    influence: 0.3,
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
  fate: {
    image: '/image/texture/082.jpg',
    colors: ['#7E275A', '#C54E90'],
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
  stripedFate: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#C25489', 0],
          ['#FB82CE', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#721D48', 0.3],
          ['#DE6BAD', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  stripedAlliance: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#CBB955', 0],
          ['#F8F1A4', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#B2A03F', 0.3],
          ['#E9E175', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
  stripedSpice: {
    image: '/image/texture/076.jpg',
    colors: [
      {
        type: 'linear',
        angle: 90,
        stops: [
          ['#AD8E49', 0],
          ['#C3AB77', 1],
        ],
      },
      {
        type: 'linear',
        angle: 120,
        stops: [
          ['#A28046', 0.3],
          ['#BAA26D', 1],
        ],
      },
    ],
    influence: 1,
    invert: true,
    definition: 0,
  },
} satisfies Record<string, BackgroundData>;
