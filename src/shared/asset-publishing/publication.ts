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
/**
 * How many times one job may fail before it stops being retried.
 * `recordFailure` in convex/publicationJobs.ts counts the attempt and parks the job at `error` on the tenth, where it stays until something enqueues that asset again.
 * A lapsed lease counts as one of these, so a Worker that keeps crashing mid-capture spends the same budget as one that keeps returning bytes the assertions reject.
 */
export const PUBLICATION_MAX_ATTEMPTS = 10;
/**
 * The ceiling on one take-work exchange, applied twice inside it: once to the lapsed leases it recovers and once to the pending jobs it hands out.
 * The Worker sizes its own batch off the same number through `MAX_ASSIGNED_ITEMS`, so raising it here also raises how much a single Worker invocation takes on.
 */
export const PUBLICATION_MAX_PICKUP = 20;
/**
 * How long a Worker holds a job before its lease lapses.
 * This is not a timeout the Worker runs down: the deadline is written onto the row at pickup, and the next take-work is what sweeps rows whose `expires_at` has passed and counts an attempt against each.
 * A job left behind by a Worker that died therefore stays `in_progress` until someone asks for work, which is why the pipeline recovers on the next poll rather than on a clock.
 */
export const PUBLICATION_JOB_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Publication asset type to the Renderer revision currently published for it, as in `{ faction_sheet: 4 }`.
 * Bumping a type's revision reprices every asset of that type, so the map is only ever raised: `scripts/publication-revisions.ts` refuses a checked-in map that sits behind production.
 */
export const rendererRevisionsSchema = z.record(z.string().trim().min(1).max(128), z.number().int().nonnegative());

/**
 * Everything the capture page needs to draw one faction sheet.
 * Unlike its siblings below, this carries the whole authored faction rather than one resolved face, because a sheet draws the entire faction and not a single picture from it.
 */
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

/**
 * Validates a job's stored `asset_data` against the schema its type demands, and returns the parsed value.
 * Both ends of storage go through it: `enqueuePublicationJob` parses before writing the row, and the snapshot query parses again before serving it, so a payload stored under an older shape fails at the boundary instead of rendering something half-formed.
 * The return is the parsed value rather than the stored one, and the snapshot hashes exactly that, which makes this schema the thing that decides a payload's identity.
 * Typed `unknown` on purpose: the caller has the asset type at runtime but the union has no useful common member, so the capture page re-parses on receipt to get its own narrow type.
 */
export function parsePublicationAssetData(assetType: PublicationAssetType, data: unknown): unknown {
  return PUBLICATION_ASSET_DATA_SCHEMAS[assetType].parse(data);
}

const publicationJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  jobId: z.string().min(1).max(128),
});

/**
 * The take-work request body, which carries nothing but its version: the server picks the jobs, the Worker does not ask for particular ones.
 * This and the two job schemas below are authenticated with the executor secret;
 * `publicationRevisionRequestSchema` uses the activation secret instead, and the two are not interchangeable.
 */
export const takePublicationWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
});

/**
 * The body reporting that a capture was stored, carrying the token that will address it.
 * `cacheToken` is minted by the Worker once the bytes are in the bucket and becomes part of the asset's published URL;
 * the delivery Worker recomputes the same HMAC over the asset's id and type before serving, so a published path is unreachable without its current token and every republication is a new URL.
 * The token format is spelled here and again as `CACHE_TOKEN_PATTERN` in convex/lib/publicationHttp.ts, which is where it is minted and verified;
 * the two literals must move together.
 * `jobId` is only length-bounded here because a Convex id cannot be validated off the wire: the handler resolves it against the table and rejects an unknown one as a bad request.
 */
export const completePublicationJobRequestSchema = publicationJobRequestSchema.extend({
  cacheToken: z.string().regex(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
});

/**
 * The body reporting that one job failed, carrying the reason that is stored on the row and shown to an operator.
 * A Worker sends this for a failure that belongs to a single job;
 * a failure of the run itself is reported by sending nothing and letting the leases lapse.
 * The message is bounded at 2000 characters because it is written to the row unmodified.
 */
export const failPublicationJobRequestSchema = publicationJobRequestSchema.extend({
  error: z.string().trim().min(1).max(2000),
});

/**
 * The operator endpoint for the Renderer revision map, behind the activation secret rather than the executor one.
 * `initialize` seeds the map and does nothing if it already exists, `read` returns it, and `activate` replaces it, which is the call that reprices published assets.
 */
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

/**
 * What take-work answers with: either a batch of leased jobs or an empty result saying why there was none.
 * `recovered` is on both arms because the sweep for lapsed leases runs before pickup is even checked, so a call that hands out nothing can still have returned work to the queue.
 * The empty arm pins `items` to length zero so a caller that reads `items` without checking `status` cannot silently process a batch that was never assigned.
 */
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

/**
 * Parses a take-work response, checking the transport envelope before the payload.
 * The envelope is loose and the result is strict, so a response that is not this protocol at all is rejected as an envelope failure rather than as a puzzling field error deep inside a job.
 */
export function parseTakeWorkResponse(value: unknown): TakeWorkResult {
  executorEnvelopeSchema.parse(value);
  return takeWorkResultSchema.parse(value);
}
