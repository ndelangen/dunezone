import type { z } from 'zod';

import type { LeaderTokenAsset } from './schema';

export const EMPTY_LEADER_TOKEN: z.infer<typeof LeaderTokenAsset> = {
  name: '',
  about: '',
  image: '/image/leader/ilya/cheap-hero.png',
  logo: '/vector/logo/ecaz.svg',
  background: {
    image: '/image/texture/044.jpg',
    colors: ['#7F3D81', '#581858'],
    influence: 1,
    invert: false,
    definition: 0.85,
  },
};

/** The approved standalone Duke Vidal disc, with the Ecaz emblem and shared faction colours. */
export const DUKE_PRAD_VIDAL_TOKEN: z.infer<typeof LeaderTokenAsset> = {
  name: 'Duke Prad Vidal',
  about: '',
  strength: 6,
  image: '/image/leader/gf9/duke-prad-vidal.png',
  logo: '/vector/logo/ecaz.svg',
  background: {
    image: '/image/texture/044.jpg',
    colors: [
      {
        type: 'linear',
        angle: 270,
        stops: [
          ['#0B4D64', 0],
          ['#0B4D64', 0.5],
          ['#7F3D81', 0.5],
          ['#7F3D81', 1],
        ],
      },
      {
        type: 'linear',
        angle: 270,
        stops: [
          ['#05333D', 0],
          ['#05333D', 0.5],
          ['#581858', 0.5],
          ['#581858', 1],
        ],
      },
    ],
    influence: 1,
    invert: false,
    definition: 0.85,
  },
};
