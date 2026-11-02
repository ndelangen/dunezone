import type { z } from 'zod';

import type { TreacheryAsset } from '../schema';

/**
 * A production-shaped treachery card for the publisher capture regression.
 *
 * Its backgrounds and vectors are real paths rather than placeholders, because the point of the regression is that the capture page settles every image and SVG resource the renderer pulls before it declares itself ready.
 * The backgrounds are spelled out rather than imported from `@game/data/backgrounds`: `src/shared` is server-reachable and may not import the browser-only renderers.
 */
export const publishingTreacheryCard: z.infer<typeof TreacheryAsset> = {
  name: 'Lasgun',
  about: 'A lasgun-shield interaction destroys both players and everything in the territory.',
  subName: 'Weapon - Special',
  head: {
    image: '/image/texture/082.jpg',
    colors: ['#8F2C1C', '#621D1A'],
    influence: 0.5,
    invert: false,
    definition: 1,
  },
  icon: [
    {
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
    '/vector/icon/projectile.svg',
  ],
  decals: [{ id: '/vector/logo/atreides.svg', muted: false, outline: true, scale: 0.4, offset: [0, 380] }],
  text: 'Play as a **weapon** during battle. Kills the opposing leader, and destroys any Shield played against it.',
};
