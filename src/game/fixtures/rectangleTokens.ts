import type { z } from 'zod';

import { backgroundPresets } from '../data/backgrounds';
import type { RectangleTokenFace } from '../data/objects';

export type RectangleTokenFaceData = z.infer<typeof RectangleTokenFace>;

const face = (data: RectangleTokenFaceData) => data;

/**
 * Authored faces shared by the stories.
 * Between them they exercise every part of the free composition: an empty face, placed decals, multi-line text, four of the seven fonts, per-element opacity, and elements deliberately hung past the edge.
 */
export const rectangleTokenFixtures = {
  /** The state a fresh token starts in, and the one most likely to look wrong. */
  empty: face({
    background: backgroundPresets.special,
    ring: false,
    decals: [],
    texts: [],
  }),
  kwisatzHaderach: face({
    background: backgroundPresets.special,
    ring: false,
    decals: [
      { id: '/vector/logo/atreides.svg', muted: false, outline: true, scale: 0.9, offset: [-55, -18], opacity: 1 },
    ],
    texts: [
      {
        content: 'KWISATZ\nHADERACH',
        offset: [-58, 34],
        size: 15,
        font: 'C_Copperplate_Gothic_Heavy',
        opacity: 1,
      },
      { content: '+2', offset: [72, 6], size: 76, font: 'C_Busorama', opacity: 1 },
    ],
  }),
  heighliner: face({
    background: backgroundPresets.defense,
    ring: true,
    decals: [
      { id: '/vector/icon/projectile.svg', muted: true, outline: false, scale: 0.8, offset: [0, -22], opacity: 0.7 },
    ],
    texts: [{ content: 'HEIGHLINER', offset: [0, 58], size: 16, font: 'C_Copperplate_Gothic', opacity: 1 }],
  }),
  /** An element placed past the face edge on purpose, which the editor allows and the frame clips. */
  bleedingOffTheEdge: face({
    background: backgroundPresets.worthless,
    ring: false,
    decals: [
      { id: '/vector/logo/harkonnen.svg', muted: false, outline: false, scale: 1.6, offset: [110, 40], opacity: 0.5 },
    ],
    texts: [{ content: 'KARAMA', offset: [-40, 4], size: 40, font: 'C_Desdemona', opacity: 1 }],
  }),
};
