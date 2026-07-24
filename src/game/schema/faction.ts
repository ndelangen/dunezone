import { z } from 'zod';

import { ALL, GENERIC, LEADERS, LOGO, PLANET, TROOP, TROOP_MODIFIER } from '../data/generated';

const STRENGTH = z.union([z.number().int(), z.string().length(1)]);
const OFFSET = z.tuple([z.number(), z.number()]);
const SCALE = z.number().min(0).max(1);
const URL = z.url();
const HEXCOLOR = z.string().regex(/^#[0-9a-f]{6}$/i);
const LEGACY_PLANET_ASSET_ORIGIN = 'https://dune.zone';

const RULE = z.strictObject({
  title: z.string().optional(),
  text: z.string(),
  karama: z.string().optional(),
});

export const Leader = z.strictObject({
  name: z.string(),
  strength: STRENGTH.optional(),
  image: LEADERS,
});

export const Decal = z.strictObject({
  id: ALL,
  muted: z.boolean(),
  outline: z.boolean(),
  scale: SCALE,
  offset: OFFSET,
});

export const TroopSide = z.strictObject({
  image: TROOP,
  name: z.string(),
  description: z.string(),
  star: TROOP_MODIFIER.optional(),
  striped: z.boolean().optional(),
});

export const Troop = z.strictObject({
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

export const LegacyBackground = z.strictObject({
  image: z.string(),
  colors: z.tuple([BACKGROUND_COLOR, BACKGROUND_COLOR]),
  strength: SCALE,
  opacity: SCALE,
});

export const Background = z.strictObject({
  image: z.string(),
  colors: z.tuple([BACKGROUND_COLOR, BACKGROUND_COLOR]),
  invert: z.boolean(),
  definition: SCALE,
  influence: SCALE,
});

export function migrateLegacyBackground(
  background: z.infer<typeof LegacyBackground>
): z.infer<typeof Background> {
  return {
    image: background.image,
    colors: background.colors,
    invert: true,
    definition: background.strength,
    influence: background.opacity,
  };
}

export function hasLegacyBackground(
  background: unknown
): background is z.infer<typeof LegacyBackground> {
  return LegacyBackground.safeParse(background).success;
}

export const BackgroundStoredSchema = z
  .union([Background, LegacyBackground])
  .transform((background) =>
    hasLegacyBackground(background) ? migrateLegacyBackground(background) : background
  );

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

  /** closest matching TTS colors */
  colors: z.array(TTSColor),

  /** used on the shield */
  hero: Leader.omit({ strength: true }),
  leaders: z.array(Leader),

  /** used for alliance-cards */
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

  /** extra game assets, used by TTS */
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
 * Canonical storage is intentionally wider than current authoring semantics:
 * historical rows with a blank name must remain readable while the UI requires
 * a name for all new canonical writes.
 */
export const CanonicalFactionStoredSchema = z.strictObject({
  ...factionShape,
  name: z.string(),
});

/**
 * Frozen contract of the frontend deployed before the background/planet
 * migration. Do not derive this from `factionShape`: compatibility must not
 * silently adopt later authoring requirements.
 */
export const LegacyFactionInputSchema = z.strictObject({
  name: z.string(),
  logo: LOGO.or(GENERIC),
  background: LegacyBackground,
  themeColor: HEXCOLOR,
  colors: z.array(TTSColor),
  hero: Leader.omit({ strength: true }),
  leaders: z.array(Leader),
  decals: z.array(Decal),
  planet: z
    .array(
      z.strictObject({
        image: URL,
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
  extras: z
    .array(
      z.strictObject({
        name: z.string(),
        description: z.string().optional(),
        items: z.array(z.strictObject({ url: URL, description: z.string().optional() })),
      })
    )
    .optional(),
});

/** URL slug on the `factions` row — not a field on `FactionInput` / `factions.data`. */
export const FactionRowSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type FactionInput = z.infer<typeof FactionInputSchema>;
export type LegacyFactionInput = z.infer<typeof LegacyFactionInputSchema>;
/** Convex `factions.data` payload; public slug is only on the faction row (`FactionEntry.slug`). */
export type FactionData = FactionInput;

/** Temporary public-read shape for the still-deployed legacy frontend. */
export function toLegacyFactionInput(input: FactionInput): LegacyFactionInput {
  return {
    ...input,
    planet: input.planet?.map((planet) => ({
      ...planet,
      image: PLANET.safeParse(planet.image).success
        ? `${LEGACY_PLANET_ASSET_ORIGIN}${planet.image}`
        : planet.image,
    })),
    background: {
      image: input.background.image,
      colors: input.background.colors,
      strength: input.background.definition,
      opacity: input.background.influence,
    },
  };
}

/**
 * Widen-phase parser for rows and older clients. All successful output is the
 * canonical background shape so reads and writes converge before narrowing.
 */
export const FactionStoredSchema = z
  .union([CanonicalFactionStoredSchema, LegacyFactionInputSchema])
  .transform((input): FactionInput => {
    const canonical = CanonicalFactionStoredSchema.safeParse(input);
    if (canonical.success) return canonical.data;
    const legacy = LegacyFactionInputSchema.parse(input);
    return {
      ...legacy,
      background: migrateLegacyBackground(legacy.background),
    };
  });

/**
 * A legacy update cannot express canonical inversion or repository-owned
 * planet paths. Restore those values when the compatibility projection comes
 * back unchanged, while retaining every field the old editor could change.
 */
export function reconcileLegacyFactionUpdate(
  input: unknown,
  previousStoredInput: unknown
): FactionInput | null {
  const legacy = LegacyFactionInputSchema.safeParse(input);
  if (!legacy.success) return null;

  const next = FactionStoredSchema.parse(legacy.data);
  const previous = FactionStoredSchema.parse(previousStoredInput);
  const canonicalPlanetImageByLegacyUrl = new Map(
    (previous.planet ?? [])
      .filter((planet) => PLANET.safeParse(planet.image).success)
      .map((planet) => [`${LEGACY_PLANET_ASSET_ORIGIN}${planet.image}`, planet.image])
  );

  return CanonicalFactionStoredSchema.parse({
    ...next,
    background: {
      ...next.background,
      invert: previous.background.invert,
    },
    planet: next.planet?.map((planet) => ({
      ...planet,
      image: canonicalPlanetImageByLegacyUrl.get(planet.image) ?? planet.image,
    })),
  });
}

/** Lowercase [a-z0-9] only; matches DB slugify base (no numeric uniqueness suffix). */
export function factionSlugBaseFromName(name: string): string {
  const raw = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
  return raw || 'faction';
}

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
