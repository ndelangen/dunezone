import { z } from 'zod';

import { ALL } from '../assetIds';
import { Background, Decal } from '../factions/schema';

const OFFSET = z.tuple([z.number(), z.number()]);
const SCALE = z.number().min(0).max(1);
const URL = z.string().url();

/**
 * Off-face prose explaining rule details the face cannot or should not carry.
 * It never reaches a rendered card or token;
 * that is the whole point of it (CONTEXT.md: About).
 *
 * No length floor, deliberately unlike `rulesetAboutSchema`, which demands 50 characters with no grace.
 * A ruleset without an About is useless, so a floor there is a real floor.
 * An asset without one is the normal case, since most treachery cards need no explanation, so a floor here would only lock every existing asset out of saving.
 * Empty is legal forever.
 * Do not "fix" this inconsistency: the two floors describe two different situations.
 *
 * The key is required rather than optional, backfilled by `assets_about_v1`.
 * `assets.data` is `v.any()`, so no Convex validator gates this: the migration is the only thing that makes it true.
 */
const About = z.string().trim();

export { Decal };

/**
 * The spice-card renderer's props.
 * No `about`, and deliberately so: `card-spice` is a planned Asset type with no `parseAssetDataForWrite` branch, so nothing can store one.
 * It gains the field when its editor does, at which point it also gains a stored superset the way `TreacheryAsset` did.
 */
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

/**
 * A stored treachery card, which is its rendered face plus what is *not* on the face.
 *
 * `Treachery` stays exactly the props `TreacheryCard` draws, so the renderer never declares a field it ignores and the
 * 24 authored fixtures behind its stories stay untouched.
 * This split is what `TokenAsset`/`TokenFace` and `DeckAsset`/`CardBack` already do;
 * treachery was the odd one out.
 */
export const TreacheryAsset = Treachery.extend({
  about: About,
});

export const FactionSide = z.strictObject({
  image: ALL,
  background: Background,
});

/**
 * One face of a token, in the vocabulary `CustomToken` already takes.
 * It extends `FactionSide` rather than restating it, so the renderer's props and the stored shape cannot drift.
 */
export const TokenFace = FactionSide.extend({
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
  /** A pronounced shadow under the ring; absent (the default) draws none beyond the renderer's built-in depth. */
  ringShadow: z.boolean().optional(),
});

/**
 * A token's back, parameterised by the face model since the two token schemas differ only there.
 *
 * Three modes, decided on «The stored shape of three back modes, and the migration»:
 * `custom` carries an authored face, `same` repeats the front, `reference` names another token whose authored back this one wears.
 * The target rides the data and is written at save, so the stored row is the single owner of its back;
 * the `token-back` relation rows this replaces are dropped by `assets_back_modes_v1`.
 *
 * `asset_id` is optional only until that migration completes everywhere;
 * the narrow that requires it rides a later release, the widen-migrate-narrow convention.
 */
function tokenBackUnion<TFace extends z.ZodType>(face: TFace) {
  return z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('custom'), face }),
    z.strictObject({ mode: z.literal('same') }),
    z.strictObject({ mode: z.literal('reference'), asset_id: z.string().min(1).optional() }),
  ]);
}

/**
 * A token of any shape.
 * Shape is the Asset type rather than a field (see CONTEXT.md: Asset type), so all three shapes share this schema and differ only in how the caller clips the face.
 *
 * Every token has a back;
 * only where it comes from varies.
 */
export const TokenAsset = z.strictObject({
  name: z.string(),
  about: About,
  front: TokenFace,
  back: tokenBackUnion(TokenFace),
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
 *
 * A cardback may instead reference another deck's authored cardback («The stored shape of three back modes»): the tagged member names the target, and the authored member spreads `CardBack` under `mode: 'custom'`.
 * There is no `same` mode, since the cardback is a deck's only face.
 * The bare member is transitional: it keeps every pre-wrap row valid until `assets_deck_cardback_wrap_v1` has tagged them all, and the narrow that removes it rides a later release.
 */
export const DeckAsset = z.strictObject({
  name: z.string(),
  about: About,
  cardback: z.union([
    CardBack.extend({ mode: z.literal('custom') }),
    z.strictObject({ mode: z.literal('reference'), asset_id: z.string().min(1) }),
    CardBack,
  ]),
});

/** The authored composition of a deck's cardback, bare or wrapped alike, or null when the cardback is a reference. */
export function authoredCardback(cardback: z.infer<typeof DeckAsset>['cardback']): z.infer<typeof CardBack> | null {
  if (!('mode' in cardback)) {
    return cardback;
  }
  if (cardback.mode !== 'custom') {
    return null;
  }
  const { mode: _mode, ...composition } = cardback;
  return composition;
}

/**
 * The band across a bundle's container: the one authored thing a bundle has.
 *
 * A bundle is the first Asset type with no visual identifying feature of its own.
 * A card's face comes from its own data and a deck looks like a deck because its author made a Cardback;
 * a bundle's row carries a name and its membership lives in `asset_relations`.
 * «What a bundle looks like» settled that it authors a container rather than wearing a house one, so that two bundles are told apart by their own identity instead of by whoever is inside them.
 *
 * `label` is separate from the Asset's name for the same reason `CardBack.name` is: a bundle called "Norbert's tech tokens" can wear a band reading "TECH".
 */
export const BundleBand = z.strictObject({
  background: Background,
  label: z.string(),
});

/**
 * A bundle: a container of tokens, mixing shapes freely, exactly as a deck contains cards.
 * Its members are `asset_relations` rows rather than data, so this carries identity and the one face it draws.
 *
 * Unlike every other Asset type, a bundle **publishes nothing** (decision on «Bundles: a token container Asset type»).
 * Its members already publish individually, and its band is interface chrome rather than something you print.
 * So there is no publication target row, no enqueue branch, and no Renderer revision entry, and that is settled rather than deferred.
 */
export const BundleAsset = z.strictObject({
  name: z.string(),
  about: About,
  band: BundleBand,
});

/**
 * The seven faces the project ships, declared in `src/app/styles/fonts.css`.
 * A rectangle token is the only Asset type that lets an author pick one, so the list lives here rather than in a renderer, and both the schema and the renderer read it.
 */
export const RECTANGLE_TOKEN_FONTS = [
  'C_Copperplate_Gothic',
  'C_Copperplate_Gothic_Heavy',
  'C_Busorama',
  'C_Desdemona',
  'C_Advokat_Modern',
  'C_Candara',
  'C_Trebuchet',
] as const;

const OPACITY = z.number().min(0).max(1);

/**
 * A decal the author placed, rather than one slotted into a fixed position.
 *
 * It extends the shared `Decal` instead of restating it, and the extension is deliberately **local to this type**.
 * `Decal` has only the binary `muted` treatment, and the faction and card editors both depend on that contract;
 * widening it and growing `DecalControls` an opacity slider would reach two editors that gain nothing from the field.
 * This is the same call `TreacheryAsset` makes over `Treachery`: widen the type that needs it, leave the shared contract alone.
 */
const PlacedDecal = Decal.extend({
  opacity: OPACITY,
  /** A drop shadow under the decal; absent (the default) draws flat. The ring's shadow and this one are the same treatment worn by two elements. */
  shadow: z.boolean().optional(),
});

/**
 * Text the author placed, in face units from the centre.
 * `offset` is deliberately unclamped, so an element may hang off the edge on purpose;
 * the editor pairs a slider for reach with a bare number for precision.
 */
const PlacedText = z.strictObject({
  content: z.string(),
  offset: OFFSET,
  /** Cap height in face units, against the renderer's 300 by 186 face. */
  size: z.number().min(1).max(200),
  font: z.enum(RECTANGLE_TOKEN_FONTS),
  opacity: OPACITY,
});

/**
 * One face of a rectangle token: a background, and two lists of placed elements.
 *
 * This is the free composition «Rectangle token editor» settled, and it is a capability no other Asset type has.
 * Every other type slots its content into fixed places, which is why this face shares nothing with `TokenFace` beyond the background.
 */
export const RectangleTokenFace = z.strictObject({
  background: Background,
  /** The thin ring just inside the edge, off by default here, unlike the round shapes. */
  ring: z.boolean(),
  /** A pronounced shadow under the ring; absent (the default) draws none. */
  ringShadow: z.boolean().optional(),
  decals: z.array(PlacedDecal),
  texts: z.array(PlacedText),
});

/**
 * A rectangle token.
 *
 * It is a token by category and by backside rules, so the `back` union matches `TokenAsset` exactly.
 * It is not a token by face, which is why it carries its own schema rather than a branch inside `TokenAsset`.
 */
export const RectangleTokenAsset = z.strictObject({
  name: z.string(),
  about: About,
  front: RectangleTokenFace,
  back: tokenBackUnion(RectangleTokenFace),
});
