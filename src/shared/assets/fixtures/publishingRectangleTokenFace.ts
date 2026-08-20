import type { z } from 'zod';

import type { RectangleTokenFace } from '../schema';

/**
 * A production-shaped rectangle token face for the publisher capture regression.
 *
 * It lives here rather than beside the story fixtures in `src/game/fixtures` because the publisher Worker may not import the game renderers as source;
 * it draws them through the capture page, which is app code.
 * That is the same reason `publishingTreacheryCard` sits here rather than beside `treacheryCardFixtures`.
 *
 * It carries both element kinds and a multi-line text, since a face that draws text is the one that can race a font, and placed text is the part of this model no other Asset type has.
 */
export const publishingRectangleTokenFace: z.infer<typeof RectangleTokenFace> = {
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#8F2C1C', '#621D1A'],
    influence: 0.5,
    invert: false,
    definition: 1,
  },
  ring: true,
  decals: [
    { id: '/vector/logo/atreides.svg', muted: false, outline: true, scale: 0.9, offset: [-55, -18], opacity: 1 },
  ],
  texts: [
    { content: 'KWISATZ\nHADERACH', offset: [-58, 34], size: 15, font: 'C_Copperplate_Gothic_Heavy', opacity: 1 },
    { content: '+2', offset: [72, 6], size: 76, font: 'C_Busorama', opacity: 1 },
  ],
};
