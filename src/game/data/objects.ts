import { z } from 'zod';

import { Background } from '../schema/faction';
import { ALL, LEADERS, LOGO, TROOP, TROOP_MODIFIER } from './generated';

export { Background, GRADIENT } from '../schema/faction';

const STRENGTH = z.union([z.number().int(), z.string().length(1)]);
const OFFSET = z.tuple([z.number(), z.number()]);
const SCALE = z.number().min(0).max(1);
const URL = z.string().url();
const COLOR = z.string().regex(/^#[0-9a-f]{6}$/i);

const RULE = z.strictObject({
  title: z.string().optional(),
  text: z.string(),
  karama: z.string().optional(),
});

export const Leader = z.strictObject({
  name: z.string(),
  strength: STRENGTH,
  image: LEADERS,
  logo: LOGO,
  background: Background,
});

export const Shield = z.strictObject({
  name: z.string(),
  leader: URL,
  logo: URL,
  background: Background,
});

export const Decal = z.strictObject({
  id: ALL,
  muted: z.boolean(),
  outline: z.boolean(),
  scale: SCALE,
  offset: OFFSET,
});

export const Alliance = z.strictObject({
  name: z.string(),
  troop: TROOP,
  logo: ALL,
  decals: z.array(Decal),
  text: z.string(),
  background: Background,
});

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

export const TroopSide = z.strictObject({
  image: TROOP,
  background: Background,
  star: TROOP_MODIFIER.optional(),
  striped: z.boolean().optional(),
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

export const Troop = z.intersection(
  TroopSide,
  z.strictObject({
    back: TroopSide.optional(),
  })
);

export const Sheet = z.strictObject({
  name: z.string(),
  logo: URL,
  color: COLOR,
  troops: z.array(
    z.strictObject({
      image: URL,
      name: z.string(),
      description: z.string(),
      back: z
        .strictObject({
          image: URL,
          name: z.string(),
          description: z.string(),
        })
        .optional(),
    })
  ),
  leaders: z.array(URL),
  start: z.string(),
  revival: z.string(),
  rules: z.array(RULE),
  fate: RULE,
  alliance: RULE,
  extras: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        items: z.array(z.object({ url: URL, description: z.string().optional() })),
      })
    )
    .optional(),
});

export const Faction = z.strictObject({
  troops: z.array(Troop),
});
