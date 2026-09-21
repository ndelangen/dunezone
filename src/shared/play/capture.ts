import { z } from 'zod';

import { CanonicalFactionStoredSchema, HistoricalFactionPublicationSchema } from '../factions/schema';
import { RULESET_ASSET_SLOT_ORDER } from '../rulesets/assetSlots';
import { spawnContentsSchema, spawnSelectionSchema } from './inventory';
import { tableCountSchema } from './schema';
import { setupDeclarationSchema } from './setup';

/*
 * What a game retains of the catalogue, and when.
 * The selected ruleset's supply is captured once at creation; a faction is captured once at public
 * assignment.
 * A capture keeps enough to supply and replay the game after the source is edited or deleted, with
 * live image references rather than image files, and a readiness verdict that names what the
 * catalogue could not yet provide.
 * The catalogue stays the authority for definitions; these records are the game's copy of them.
 */

const identitySchema = z.string().min(1).max(160);
const sourceSchema = z.object({ id: identitySchema, slug: z.string().max(160), name: z.string().max(160) });
const slotAssetSchema = sourceSchema.extend({ type: z.string().max(160) });

/** What the catalogue answers when a game captures a ruleset: its identity and its slotted assets. */
export const rulesetSupplySchema = z.object({
  ruleset: sourceSchema,
  slots: z.array(z.object({ slot: z.enum(RULESET_ASSET_SLOT_ORDER), asset: slotAssetSchema })),
});
export type RulesetSupply = z.infer<typeof rulesetSupplySchema>;

/**
 * What the catalogue answers when a game captures a faction: its stored definition when it parses, and the faces its generated components have published, the token and one per supporting leader.
 */
export const factionDefinitionSchema = z.object({
  faction: sourceSchema,
  data: CanonicalFactionStoredSchema.nullable(),
  token: z.string().nullable(),
  cardbacks: z.object({ traitor: z.string().nullable(), alliance: z.string().nullable() }).optional(),
  leaders: z.array(z.object({ memberId: identitySchema, front: z.string().nullable() })),
});

/** A live publication reference, or null while the catalogue has no usable image for the face. */
const faceSchema = z.string().url().nullable();

const problemSchema = z.object({ subject: z.string().max(160), reason: z.string().max(400) });
/** Ready means every required definition and image is present; the problems say exactly what is not. */
const captureReadinessSchema = z
  .object({ ready: z.boolean(), problems: z.array(problemSchema) })
  .refine((verdict) => verdict.ready === (verdict.problems.length === 0), {
    message: 'A verdict is ready exactly when it names no problem.',
  });
export type CaptureProblem = z.infer<typeof problemSchema>;
export type CaptureReadiness = z.infer<typeof captureReadinessSchema>;

/**
 * One referenced deck, bundle or token as the game keeps it: the captured contents, or the reason the capture refused it.
 * A refused reference is kept by name so the verdict can be read back without the catalogue.
 */
const slotCaptureSchema = z.object({ asset: slotAssetSchema, contents: spawnContentsSchema.nullable() });
export type SlotCapture = z.infer<typeof slotCaptureSchema>;

export const rulesetCaptureSchema = z.object({
  ruleset: sourceSchema,
  capturedAt: tableCountSchema,
  decks: z.object({
    treachery: slotCaptureSchema.nullable(),
    spice: slotCaptureSchema.nullable(),
    custom: z.array(slotCaptureSchema),
  }),
  bundles: z.object({
    techToken: slotCaptureSchema.nullable(),
    custom: z.array(slotCaptureSchema),
  }),
  readiness: captureReadinessSchema,
});
export type RulesetCapture = z.infer<typeof rulesetCaptureSchema>;

/**
 * The generated components setup supplies for one faction, each with the faces the catalogue has published for it.
 * A leader's back is the faction token's face.
 * Troops, the alliance card and the traitor cards have no publication yet;
 * their faces stay null and the verdict names them until the component publication deliveries land.
 */
const factionComponentsSchema = z.object({
  token: z.object({ front: faceSchema, back: faceSchema }),
  leaders: z.array(
    z.object({
      memberId: identitySchema,
      name: z.string().max(160),
      strength: z.union([z.number().int(), z.string().length(1)]).nullable(),
      front: faceSchema,
      back: faceSchema,
    })
  ),
  troops: z.array(
    z.object({
      name: z.string().max(160),
      count: z.number().int().positive(),
      front: faceSchema,
      back: faceSchema,
    })
  ),
  alliance: z.object({ front: faceSchema, back: faceSchema }),
  traitors: z.object({
    back: faceSchema,
    cards: z.array(z.object({ memberId: identitySchema, name: z.string().max(160), front: faceSchema })),
  }),
});

export const factionCaptureSchema = z.object({
  faction: sourceSchema,
  capturedAt: tableCountSchema,
  /*
   * The stored faction as it read at capture; later edits and deletion do not reach it.
   * Read back through the historical decoder, so a later narrowing of the live faction schema
   * cannot make a game lose a faction it already holds.
   */
  definition: HistoricalFactionPublicationSchema,
  setupPhases: z.array(setupDeclarationSchema).optional(),
  components: factionComponentsSchema,
  /** Each Extra is supplied once per faction; a refused reference keeps its name and the reason. */
  extras: z.array(slotCaptureSchema),
  readiness: captureReadinessSchema,
});
export type FactionCapture = z.infer<typeof factionCaptureSchema>;

/** A catalogue reference an Extra names: the same selection the shared inventory spawns from. */
const extraReferenceSchema = spawnSelectionSchema;
export type ExtraReference = z.infer<typeof extraReferenceSchema>;

export function readiness(problems: CaptureProblem[]): CaptureReadiness {
  return { ready: problems.length === 0, problems };
}
