import type { z } from 'zod';

import type { TokenFace } from '../schema';

/**
 * A production-shaped token face for the publisher capture regression.
 *
 * It carries a real texture and a real vector for the same reason the card and Cardback fixtures do, since the regression exists to prove the capture page settles every image and SVG resource the renderer pulls before it reports ready.
 * Both curved label positions are filled, because an empty label is the easy case and a token that draws text is the one that can race a font.
 * The background is spelled out rather than imported from `@game/data/backgrounds`, because `src/shared` is server-reachable and may not import the browser-only renderers.
 */
export const publishingTokenFace: z.infer<typeof TokenFace> = {
  image: '/vector/icon/projectile.svg',
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#8F2C1C', '#621D1A'],
    influence: 0.5,
    invert: false,
    definition: 1,
  },
  symbolScale: 1.1,
  top: 'KARAMA',
  bottomFirst: 'ONE USE',
  bottomSecond: 'THEN DISCARD',
  ring: true,
};
