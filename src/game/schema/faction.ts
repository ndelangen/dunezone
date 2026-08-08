import { z } from 'zod';

import {
  ALL,
  BACKGROUND,
  GENERIC,
  LEADERS,
  LOGO,
  PLANET,
  TEXTURE,
  TROOP,
  TROOP_MODIFIER,
} from '../data/generated';

const STRENGTH = z.union([z.number().int(), z.string().length(1)]);
const OFFSET = z.tuple([z.number(), z.number()]);
const SCALE = z.number().min(0).max(1);
const URL = z.url();
const HEXCOLOR = z.string().regex(/^#[0-9a-f]{6}$/i);

const RULE = z.strictObject({
  title: z.string().optional(),
  text: z.string(),
  karama: z.string().optional(),
});

const Leader = z.strictObject({
  name: z.string(),
  strength: STRENGTH.optional(),
  image: LEADERS,
});

const Decal = z.strictObject({
  id: ALL,
  muted: z.boolean(),
  outline: z.boolean(),
  scale: SCALE,
  offset: OFFSET,
});

const TroopSide = z.strictObject({
  image: TROOP,
  name: z.string(),
  description: z.string(),
  star: TROOP_MODIFIER.optional(),
  striped: z.boolean().optional(),
});

const Troop = z.strictObject({
  image: TROOP,
  name: z.string(),
  description: z.string(),
  star: TROOP_MODIFIER.optional(),
  striped: z.boolean().optional(),
  back: TroopSide.optional(),
  count: z.number().int().positive(),
  planet: z.string().optional(),
});

export const GRADIENT = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('linear'),
    angle: z.number().int().min(0).max(360),
    stops: z.array(z.tuple([HEXCOLOR, SCALE])),
  }),
  z.strictObject({
    type: z.literal('radial'),
    x: z.number().optional(),
    y: z.number().optional(),
    r: z.number().optional(),
    stops: z.array(z.tuple([HEXCOLOR, SCALE])),
  }),
]);

const BACKGROUND_COLOR = z.union([HEXCOLOR, GRADIENT]);

export const Background = z.strictObject({
  image: TEXTURE.or(BACKGROUND),
  colors: z.tuple([BACKGROUND_COLOR, BACKGROUND_COLOR]),
  invert: z.boolean(),
  definition: SCALE,
  influence: SCALE,
});

export const TTSColor = z.enum([
  'White',
  'Brown',
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Teal',
  'Blue',
  'Purple',
  'Pink',
]);

const factionShape = {
  name: z.string().refine((name) => name.trim().length > 0, {
    message: 'Faction name is required because it determines the faction URL',
  }),
  logo: LOGO.or(GENERIC),
  background: Background,
  themeColor: HEXCOLOR,

  /** Closest matching TTS colors */
  colors: z.array(TTSColor),

  /** Used on the shield */
  hero: Leader.omit({ strength: true }),
  leaders: z.array(Leader),

  /** Used for alliance-cards */
  decals: z.array(Decal),
  planet: z
    .array(
      z.strictObject({
        image: PLANET.or(URL),
        name: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  troops: z.array(Troop),

  rules: z.strictObject({
    startText: z.string(),
    revivalText: z.string(),
    spiceCount: z.number().int().positive(),
    advantages: z.array(RULE),
    fate: RULE.omit({ karama: true }),
    alliance: RULE.omit({ karama: true, title: true }).required(),
  }),

  /** Extra game assets, used by TTS */
  extras: z
    .array(
      z.strictObject({
        name: z.string(),
        description: z.string().optional(),
        items: z.array(z.strictObject({ url: URL, description: z.string().optional() })),
      })
    )
    .optional(),
};

/** Rejects unknown keys (e.g. `slug` must live on the Convex row, not in `data`). */
export const FactionInputSchema = z.strictObject(factionShape);

/**
 * Canonical storage is intentionally wider than current authoring semantics: historical rows with a
 * blank name must remain readable while the UI requires a name for all new canonical writes.
 */
export const CanonicalFactionStoredSchema = z.strictObject({
  ...factionShape,
  name: z.string(),
});

/**
 * Client read-path variants: tolerate unknown top-level fields so additive server changes never
 * break stale tabs; genuine breaks (missing or mistyped fields) still fail the client boundary (see
 * db/core/clientBoundary).
 */
export const CanonicalFactionClientSchema = z.looseObject({ ...factionShape, name: z.string() });
export const BackgroundClientSchema = z.looseObject(Background.shape);

/** URL slug on the `factions` row — not a field on `FactionInput` / `factions.data`. */
export const FactionRowSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type FactionInput = z.infer<typeof FactionInputSchema>;
/** Convex `factions.data` payload; public slug is only on the faction row (`FactionEntry.slug`). */
export type FactionData = FactionInput;

export const FactionRender = {
  alliance: FactionInputSchema.transform((input) => ({
    title: input.name,
    text: input.rules.alliance.text,
    logo: input.logo,
    background: input.background,
    troop: input.troops[0]?.image,
    decals: input.decals,
  })),
  leaders: FactionInputSchema.transform((input) =>
    input.leaders.map((leader) => ({
      ...leader,
      background: input.background,
      logo: input.logo,
    }))
  ),
  traitors: FactionInputSchema.transform((input) =>
    input.leaders.map((leader) => ({
      ...leader,
      logo: input.logo,
      background: input.background,
      owner: input.name,
    }))
  ),
  troops: FactionInputSchema.transform((input) =>
    input.troops.map((troop) => ({
      image: troop.image,
      background: input.background,
      star: troop.star,
      striped: troop.striped,
    }))
  ),
  shield: FactionInputSchema.transform((input) => ({
    name: input.name,
    leader: input.hero,
    background: input.background,
    logo: input.logo,
  })),
  sheet: FactionInputSchema.transform((input) => ({
    name: input.name,
    themeColor: input.themeColor,
    logo: input.logo,
    background: input.background,
    leaders: input.leaders,
    troops: input.troops,
    rules: input.rules,
  })),
  token: FactionInputSchema.transform((input) => ({
    logo: input.logo,
    background: input.background,
  })),
};
