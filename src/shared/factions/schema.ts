import { z } from 'zod';

import { ALL, BACKGROUND, GENERIC, LEADERS, LOGO, PLANET, TEXTURE, TROOP, TROOP_MODIFIER } from '../assetIds';
import { marksOnlyFormattedTextSchema, proseFormattedTextSchema } from '../formattedText';
import { extraPhasesSchema } from './extraPhases';
import { factionExtrasSchema, storedFactionExtrasSchema } from './extras';
import { assertUniqueFactionMemberIds, FactionMemberIdSchema } from './memberIdentity';
import { assertUniqueFactionTroopIds, FactionTroopIdSchema } from './troopIdentity';

const STRENGTH = z.union([z.number().int(), z.string().length(1)]);
const OFFSET = z.tuple([z.number(), z.number()]);
const SCALE = z.number().min(0).max(1);
/* Decal scale outgrew the 0-1 range: the vector-train retune multiplied stored
   placements by factors up to 1.738, so saved values above 1 are legitimate. */
const DECAL_SCALE = z.number().min(0).max(3);
const URL = z.url();
const HEXCOLOR = z.string().regex(/^#[0-9a-f]{6}$/i);

const RULE = z.strictObject({
  title: z.string().optional(),
  text: z.string(),
  karama: z.string().optional(),
});

const Leader = z.strictObject({
  memberId: FactionMemberIdSchema.optional(),
  name: z.string(),
  strength: STRENGTH.optional(),
  image: LEADERS,
});

export const Decal = z.strictObject({
  id: ALL,
  muted: z.boolean(),
  outline: z.boolean(),
  scale: DECAL_SCALE,
  offset: OFFSET,
});

/**
 * What one troop face contributes to a battle plan (#1062).
 * Strengths may be fractional or negative;
 * the funding cost is whole spice, zero or more, and one when absent.
 * A face without this object has no authored combat values, which is never read as zero.
 */
export const TroopCombat = z.strictObject({
  strength: z.number(),
  fundedStrength: z.number(),
  fundingCost: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});

/* `capable` is the face's battle eligibility, separate from its strengths: an authored face without it can fight. */
const TroopSide = z.strictObject({
  image: TROOP,
  name: z.string(),
  description: z.string(),
  star: TROOP_MODIFIER.optional(),
  hue: z.string().optional(),
  striped: z.boolean().optional(),
  capable: z.boolean().optional(),
  combat: TroopCombat.optional(),
});

const Troop = z.strictObject({
  troopId: FactionTroopIdSchema.optional(),
  image: TROOP,
  name: z.string(),
  description: z.string(),
  star: TROOP_MODIFIER.optional(),
  hue: z.string().optional(),
  striped: z.boolean().optional(),
  capable: z.boolean().optional(),
  combat: TroopCombat.optional(),
  back: TroopSide.optional(),
  count: z.number().int().positive(),
  planet: z.string().optional(),
});

/** A troop as a game table draws it: its artwork alone, since a face's combat values reach the plans on their own path. */
export const TroopArtwork = Troop.omit({ capable: true, combat: true }).extend({
  back: TroopSide.omit({ capable: true, combat: true }).optional(),
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

const FactionComplexitySchema = z.strictObject({
  calculated: SCALE,
  manual: SCALE.optional(),
});

const factionBaseShape = {
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

  /**
   * Catalogue decks, bundles and tokens this faction supplies at setup (#1226);
   * a missing field reads as `[]`.
   * Reads drop the retired TTS link lists until `faction_extras_references_v1` is verified everywhere.
   */
  extras: storedFactionExtrasSchema.optional(),

  /** Phases this faction adds to setup or every turn (#1138); a missing field reads as `[]`. */
  extraPhases: extraPhasesSchema.optional(),
};

const factionShape = {
  ...factionBaseShape,
  /** Stored calculated rating plus the optional author-chosen override. */
  complexity: FactionComplexitySchema,
};

const AuthoringRule = RULE.extend({
  text: proseFormattedTextSchema,
  karama: proseFormattedTextSchema.optional(),
});

const AuthoringTroopSide = TroopSide.extend({ description: proseFormattedTextSchema });

const AuthoringTroop = Troop.extend({
  description: proseFormattedTextSchema,
  back: AuthoringTroopSide.optional(),
});

const factionAuthoringShape = {
  ...factionShape,
  planet: z
    .array(
      z.strictObject({
        image: PLANET.or(URL),
        name: z.string(),
        description: proseFormattedTextSchema,
      })
    )
    .optional(),
  troops: z.array(AuthoringTroop),
  rules: z.strictObject({
    startText: marksOnlyFormattedTextSchema,
    revivalText: marksOnlyFormattedTextSchema,
    spiceCount: z.number().int().positive(),
    advantages: z.array(AuthoringRule),
    fate: AuthoringRule.omit({ karama: true }),
    alliance: AuthoringRule.omit({ karama: true, title: true }).required(),
  }),
  extras: factionExtrasSchema.optional(),
};

type ComponentRoster = Parameters<typeof assertUniqueFactionMemberIds>[0] &
  Parameters<typeof assertUniqueFactionTroopIds>[0];

/** Leader and troop identities are each unique within their faction (#1227). */
function refineUniqueComponentIds(data: ComponentRoster, ctx: z.RefinementCtx) {
  try {
    assertUniqueFactionMemberIds(data);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Faction member IDs must be unique within the faction.' });
  }
  try {
    assertUniqueFactionTroopIds(data);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Faction troop IDs must be unique within the faction.' });
  }
}

/** Rejects unknown keys (e.g. `slug` must live on the Convex row, not in `data`). */
export const FactionInputSchema = z.strictObject(factionAuthoringShape).superRefine(refineUniqueComponentIds);

/** A faction has zero to ten supporting leaders; five is conventional (#644). */
export const SUPPORTING_LEADER_LIMIT = 10;

/**
 * What a save accepts: authoring semantics plus the supporting-leader cap.
 * Reads and renders keep `FactionInputSchema`, so a stored faction over the cap still loads and renders;
 * it just cannot be saved until trimmed.
 */
export const FactionWriteSchema = FactionInputSchema.refine(
  (faction) => faction.leaders.length <= SUPPORTING_LEADER_LIMIT,
  {
    message: `A faction can have at most ${SUPPORTING_LEADER_LIMIT} supporting leaders.`,
    path: ['leaders'],
  }
);

/**
 * Canonical storage is intentionally wider than current authoring semantics: historical rows with a blank name must remain readable while the UI requires a name for all new canonical writes.
 */
export const CanonicalFactionStoredSchema = z.strictObject({
  ...factionShape,
  name: z.string(),
  hero: Leader.omit({ strength: true }).extend({ memberId: FactionMemberIdSchema }),
  leaders: z.array(Leader.extend({ memberId: FactionMemberIdSchema })),
  troops: z.array(Troop.extend({ troopId: FactionTroopIdSchema })),
});

/** Frozen sheet jobs and standalone previews may predate persistent member identity. Keep this decoder after live schema narrowing. */
export const HistoricalFactionPublicationSchema = z.strictObject({
  ...factionShape,
  name: z.string(),
  hero: Leader.omit({ strength: true }).extend({ memberId: FactionMemberIdSchema.optional() }),
  leaders: z.array(Leader.extend({ memberId: FactionMemberIdSchema.optional() })),
});

/** Complete canonical data also requires unique member identities across the roster. */
export const IdentifiedFactionStoredSchema = CanonicalFactionStoredSchema.superRefine(refineUniqueComponentIds);

/**
 * Client read-path variants: tolerate unknown top-level fields so additive server changes never break stale tabs;
 * genuine breaks (missing or mistyped fields) still fail the client boundary (see db/core/clientBoundary).
 */
export const CanonicalFactionClientSchema = z.looseObject(CanonicalFactionStoredSchema.shape);

/**
 * The faction fields a catalogue-shaped surface actually draws (#642).
 * One mask, so the stored schema, the client schema and the Convex wire validator cannot drift apart.
 * The rest of the blob is 72% of its weight and no catalogue surface reads it;
 * detail pages and the editor keep the full shape through their own contract.
 */
const catalogueFactionMask = {
  name: true,
  logo: true,
  background: true,
  hero: true,
  leaders: true,
  complexity: true,
} as const;

export const CatalogueFactionStoredSchema = CanonicalFactionStoredSchema.pick(catalogueFactionMask);

/** Loose like its parent, so an additive server change still never breaks a stale tab. */
export const CatalogueFactionClientSchema = CanonicalFactionClientSchema.pick(catalogueFactionMask);

/**
 * Inferred from the strict variant on purpose: `.pick()` carries a `looseObject`'s catchall through, so taking this from the client schema would type every dropped field as `unknown` rather than refusing it, and a later read of `data.rules` would compile and then silently render nothing.
 * Parse loose, declare strict, the same split `toFactionEntry` uses.
 */
export type CatalogueFactionData = z.infer<typeof CatalogueFactionStoredSchema>;

/** URL slug on the `factions` row, not a field on `FactionInput` / `factions.data`. */
export const FactionRowSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Also the Convex `factions.data` payload; a faction's public slug is on the row, never in here (`FactionEntry.slug`). */
export type FactionInput = z.infer<typeof FactionInputSchema>;

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
      hue: troop.hue,
      striped: troop.striped,
    }))
  ),
  shield: FactionInputSchema.transform((input) => ({
    name: input.name,
    leader: input.hero,
    background: input.background,
    logo: input.logo,
  })),
  sheet: HistoricalFactionPublicationSchema.transform((input) => ({
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
