import { z } from 'zod';

import { ALL } from '../assetIds';
import { Background, Decal } from '../factions/schema';

const OFFSET = z.tuple([z.number(), z.number()]);
const SCALE = z.number().min(0).max(1);
const URL = z.string().url();

export { Decal };

export const Spice = z.strictObject({
  name: z.string(),
  subName: z.string(),
  icon: z.enum(['spice-mine', 'spice'] as const),
  highlights: z.array(
    z.enum([
      //sand
      'imperial-basin',
      'bight-of-the-cliff',
      'habbanya-ridge-flat',
      'arsunt',
      'cielago-depression',
      'hagga-basin',
      'cielago-east',
      'rock-outcroppings',
      'habbanya-erg',
      'funeral-plain',
      'wind-pass-north',
      'cielago-west',
      'meridian',
      'cielago-south',
      'cielago-north',
      'harg-pass',
      'wind-pass',
      'the-minor-erg',
      'south-mesa',
      'the-great-flat',
      'gara-kulon',
      'hole-in-the-rock',
      'basin',
      'tsimpo',
      'old-gap',
      'broken-land',
      'the-greater-flat',
      'red-chasm',
      'sihaya-ridge',

      //rock
      'false-wall-west',
      'false-wall-south',
      'shield-wall',
      'false-wall-east',
      'pasty-mesa',
      'rim-wall-west',
      'plastic-basin',

      //stronghold
      'arrakeen',
      'carthag',
      'tueks',
      'tabr',
      'habbanya',

      //special
      'polar',

      //category
      'rock',
      'strongholds',
      'sand',
    ] as const)
  ),
  overlays: z
    .array(
      z.strictObject({
        image: URL,
        offset: OFFSET,
        scale: SCALE,
      })
    )
    .optional(),
  text: z.string().optional(),
  amount: z.number().int().positive(),
});

export const Treachery = z.strictObject({
  name: z.string(),
  subName: z.string(),
  head: Background,
  icon: z.tuple([Background, ALL]),
  iconOffset: z.tuple([z.number(), z.number()]).optional(),
  iconScale: SCALE.optional(),
  decals: z.array(Decal),
  text: z.string(),
});

export const FactionSide = z.strictObject({
  image: ALL,
  background: Background,
});

export const CardBack = z.strictObject({
  image: ALL,
  imageOffset: OFFSET,
  imageScale: SCALE,
  background: Background,
  name: z.string(),
});
