import { z } from 'zod';

import { CanonicalFactionStoredSchema } from '../factions/schema';
import { spawnContentsSchema, spawnSelectionSchema } from './inventory';
import { tableCountSchema } from './schema';

/*
 * What a game retains of the catalogue, and when.
 * The selected ruleset's supply is captured once at creation; a faction is captured once at public
 * assignment.
 * A capture keeps enough to supply and replay the game after the source is edited or deleted, with
 * live image references rather than image files, and a readiness verdict that names what the
 * catalogue could not yet provide.
 * The catalogue stays the authority for definitions; these records are the game's copy of them.
 */

/** A live publication reference, or null while the catalogue has no usable image for the face. */
const faceSchema = z.string().url().nullable();

const sourceSchema = z.object({
  id: z.string().min(1).max(160),
  slug: z.string().max(160),
  name: z.string().max(160),
});

const problemSchema = z.object({ subject: z.string().max(160), reason: z.string().max(400) });
/** Ready means every required definition and image is present; the problems say exactly what is not. */
const captureReadinessSchema = z.object({ ready: z.boolean(), problems: z.array(problemSchema) });
export type CaptureProblem = z.infer<typeof problemSchema>;
export type CaptureReadiness = z.infer<typeof captureReadinessSchema>;

/**
 * One slotted deck or bundle as the game keeps it: the captured contents, or the reason the capture refused it.
 * A refused slot is kept by name so the verdict can be read back without the catalogue.
 */
const slotCaptureSchema = z.object({
  asset: sourceSchema.extend({ type: spawnSelectionSchema.shape.type }),
  contents: spawnContentsSchema.nullable(),
});
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

const memberIdSchema = z.string().min(1).max(160);

/** A declared extra phase, as the catalogue decision shapes it. Authoring lands later; until then a faction declares none. */
const capturedPhaseSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().max(160),
  symbol: z.string().max(160),
  before: z.string().max(160),
  priority: z.number().int(),
  instructions: z.string().max(4000),
});

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
      memberId: memberIdSchema,
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
    cards: z.array(z.object({ memberId: memberIdSchema, name: z.string().max(160), front: faceSchema })),
  }),
});

export const factionCaptureSchema = z.object({
  faction: sourceSchema,
  capturedAt: tableCountSchema,
  /** The stored faction as it read at capture; later edits and deletion do not reach it. */
  definition: CanonicalFactionStoredSchema,
  components: factionComponentsSchema,
  /** Each Extra is supplied once per faction; a refused reference keeps its name and the reason. */
  extras: z.array(slotCaptureSchema),
  phases: z.array(capturedPhaseSchema),
  readiness: captureReadinessSchema,
});
export type FactionCapture = z.infer<typeof factionCaptureSchema>;

/** A catalogue reference an Extra names: the same selection the shared inventory spawns from. */
const extraReferenceSchema = spawnSelectionSchema;
export type ExtraReference = z.infer<typeof extraReferenceSchema>;

export function readiness(problems: CaptureProblem[]): CaptureReadiness {
  return { ready: problems.length === 0, problems };
}
