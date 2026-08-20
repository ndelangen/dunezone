import { z } from 'zod';

import { CardBack, RectangleTokenFace, TokenFace, TreacheryAsset } from '../assets/schema';
import { FactionInputSchema, FactionRowSlugSchema } from '../factions/schema';
import { PUBLICATION_ASSET_TYPES } from './publicationTargets';
import type { PublicationAssetType } from './publicationTargets';

export const FACTION_SHEET_ASSET_TYPE = 'faction_sheet' as const;
export const TREACHERY_CARD_ASSET_TYPE = 'card-treachery' as const;
export const DECK_ASSET_TYPE = 'deck' as const;
/** The three shapes whose face is a symbol in a fixed slot. The rectangle is a token too, and a different face model. */
export const ROUND_TOKEN_ASSET_TYPES = ['token-disc', 'token-tech', 'token-plate'] as const;
export const RECTANGLE_TOKEN_ASSET_TYPE = 'token-enhance' as const;
export const PUBLICATION_MAX_ATTEMPTS = 10;
export const PUBLICATION_MAX_PICKUP = 20;
export const PUBLICATION_JOB_EXPIRY_MS = 5 * 60 * 1000;

export const rendererRevisionsSchema = z.record(z.string().trim().min(1).max(128), z.number().int().nonnegative());

export const factionSheetAssetDataSchema = z.strictObject({
  factionId: z.string().min(1),
  slug: FactionRowSlugSchema,
  faction: FactionInputSchema,
});

/**
 * Everything the capture page needs to draw one treachery card, and nothing the renderer would ignore.
 * The slug rides along for diagnostics only: the published URL keys on the id, so a rename never moves it.
 */
export const treacheryCardAssetDataSchema = z.strictObject({
  assetId: z.string().min(1),
  slug: z.string().min(1),
  card: TreacheryAsset,
});

/**
 * Everything the capture page needs to draw one deck's Cardback.
 *
 * It carries the `cardback` alone rather than the whole stored deck, because «Deck publication is its Cardback only» makes the Cardback the entire input to a deck's publication.
 * A deck's `name` and `about` are not on the face, so keeping them out means a rename or an About edit cannot change the payload hash of a picture that did not change.
 * The slug rides along for diagnostics only, the same as the card's.
 */
export const deckCardbackAssetDataSchema = z.strictObject({
  assetId: z.string().min(1),
  slug: z.string().min(1),
  cardback: CardBack,
});

/**
 * One token face, already resolved.
 *
 * The payload carries the face itself rather than the whole token plus a front/back marker, so the capture page never dispatches on which face it is drawing: the asset type picks the renderer and its clip, and the payload is what goes inside.
 * That is what lets a back publish under a qualified id with the pipeline untouched, per «Token multi-face publication model».
 * The slug rides along for diagnostics only, the same as the card's and the deck's.
 */
export const tokenFaceAssetDataSchema = z.strictObject({
  assetId: z.string().min(1),
  slug: z.string().min(1),
  face: TokenFace,
});

/** The same envelope for the shape whose face is a free composition rather than a slotted symbol. */
export const rectangleTokenFaceAssetDataSchema = z.strictObject({
  assetId: z.string().min(1),
  slug: z.string().min(1),
  face: RectangleTokenFace,
});

/**
 * The one place a Publication asset type is turned back into the shape its capture page expects.
 * Convex parses through it before serving a snapshot, and the capture page parses the same schemas on receipt, so a job whose stored `asset_data` no longer satisfies its type fails at the boundary rather than rendering something half-formed.
 */
const PUBLICATION_ASSET_DATA_SCHEMAS = {
  [FACTION_SHEET_ASSET_TYPE]: factionSheetAssetDataSchema,
  [TREACHERY_CARD_ASSET_TYPE]: treacheryCardAssetDataSchema,
  [DECK_ASSET_TYPE]: deckCardbackAssetDataSchema,
  'token-disc': tokenFaceAssetDataSchema,
  'token-tech': tokenFaceAssetDataSchema,
  'token-plate': tokenFaceAssetDataSchema,
  [RECTANGLE_TOKEN_ASSET_TYPE]: rectangleTokenFaceAssetDataSchema,
} as const satisfies Record<PublicationAssetType, z.ZodType>;

export function parsePublicationAssetData(assetType: PublicationAssetType, data: unknown): unknown {
  return PUBLICATION_ASSET_DATA_SCHEMAS[assetType].parse(data);
}

const publicationJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  jobId: z.string().min(1).max(128),
});

export const takePublicationWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
});

export const completePublicationJobRequestSchema = publicationJobRequestSchema.extend({
  cacheToken: z.string().regex(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
});

export const failPublicationJobRequestSchema = publicationJobRequestSchema.extend({
  error: z.string().trim().min(1).max(2000),
});

export const publicationRevisionRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('initialize'),
    rendererRevisions: rendererRevisionsSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('read'),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal('activate'),
    rendererRevisions: rendererRevisionsSchema,
  }),
]);

export type FactionSheetAssetData = z.infer<typeof factionSheetAssetDataSchema>;

/**
 * Wire contract for the executor take-work exchange.
 * The worker parses every response through these schemas;
 * the Convex mutation's id-branded validator stays the server-side authority, linked by a drift test in convex/publicationJobs.test.ts.
 */
const assignedPublicationJobSchema = z.object({
  jobId: z.string(),
  assetType: z.enum(PUBLICATION_ASSET_TYPES),
  assetId: z.string(),
  expiresAt: z.number().finite(),
});

export type AssignedPublicationJob = z.infer<typeof assignedPublicationJobSchema>;

export const takeWorkResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('empty'),
    reason: z.enum(['disabled', 'no_pending_work']),
    recovered: z.number().finite(),
    items: z.array(assignedPublicationJobSchema).max(0),
  }),
  z.object({
    status: z.literal('assigned'),
    recovered: z.number().finite(),
    items: z.array(assignedPublicationJobSchema).min(1).max(PUBLICATION_MAX_PICKUP),
  }),
]);

export type TakeWorkResult = z.infer<typeof takeWorkResultSchema>;

const executorEnvelopeSchema = z.looseObject({ ok: z.literal(true), schemaVersion: z.literal(1) });

export function parseTakeWorkResponse(value: unknown): TakeWorkResult {
  executorEnvelopeSchema.parse(value);
  return takeWorkResultSchema.parse(value);
}
