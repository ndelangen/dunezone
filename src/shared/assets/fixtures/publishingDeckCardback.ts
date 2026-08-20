import type { z } from 'zod';

import type { CardBack } from '../schema';

/**
 * A production-shaped deck Cardback for the publisher capture regression.
 *
 * It carries a real texture and a real vector for the same reason the treachery fixture does, since the regression exists to prove the capture page settles every image and SVG resource the renderer pulls before it reports ready.
 * The background is spelled out rather than imported from `@game/data/backgrounds`, because `src/shared` is server-reachable and may not import the browser-only renderers.
 *
 * This is only the Cardback, not a whole deck, which is exactly what a deck publishes (wayfinder #495) and exactly what the snapshot payload carries.
 */
export const publishingDeckCardback: z.infer<typeof CardBack> = {
  name: 'Treachery',
  image: '/vector/logo/atreides.svg',
  imageOffset: [0, 0],
  imageScale: 0.55,
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#8F2C1C', '#621D1A'],
    influence: 0.5,
    invert: false,
    definition: 1,
  },
};
