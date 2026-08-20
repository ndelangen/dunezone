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
  /** Flips the icon vector from dark to light artwork. */
  iconInvert: z.boolean().optional(),
  /** Fades the icon vector; 1 (the default) is fully opaque. */
  iconOpacity: SCALE.optional(),
  decals: z.array(Decal),
  text: z.string(),
});

export const FactionSide = z.strictObject({
  image: ALL,
  background: Background,
});

/**
 * One face of a tech token, in the vocabulary `CustomToken` already takes.
 * It extends `FactionSide` rather than restating it, so the renderer's props and the stored shape cannot drift.
 */
const TokenFace = FactionSide.extend({
  /** Multiplies the renderer's reference symbol size. */
  symbolScale: z.number().min(0.5).max(2),
  /** The curved label along the top edge. */
  top: z.string(),
  /**
   * The two curved lines along the bottom edge, inner first.
   * Stored as two fields and joined for the renderer, which takes one string split on a newline, because a newline inside a single field is a value no editor should have to defend against.
   */
  bottomFirst: z.string(),
  bottomSecond: z.string(),
  /** The thin edge ring, on by default. */
  ring: z.boolean(),
});

/**
 * A tech token of any shape.
 * Shape is the Asset type rather than a field (see CONTEXT.md: Asset type), so all three shapes share this schema and differ only in how the caller clips the face.
 *
 * Every token has a back;
 * only where it comes from varies.
 * A referenced back is an `asset_relations` row rather than data, so this records the mode and, for a custom back, the face itself.
 */
export const TokenAsset = z.strictObject({
  name: z.string(),
  front: TokenFace,
  back: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('custom'), face: TokenFace }),
    z.strictObject({ mode: z.literal('reference') }),
  ]),
});

export const CardBack = z.strictObject({
  image: ALL,
  imageOffset: OFFSET,
  imageScale: SCALE,
  background: Background,
  name: z.string(),
});

/**
 * A deck.
 * Its members are `asset_relations` rows rather than data, so this carries identity and the one face a deck publishes.
 *
 * The cardback is the renderer's own `CardBack` contract rather than a restatement of it, so the stored shape and the thing that draws it cannot drift.
 * Whether that composition came from a stock back or was authored is deliberately not stored: publication is uniform either way, so stock only supplies the render payload, and the editor recovers the choice by comparing values the same way a background preset is recovered.
 */
export const DeckAsset = z.strictObject({
  name: z.string(),
  cardback: CardBack,
});
