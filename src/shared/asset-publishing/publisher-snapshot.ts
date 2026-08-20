import { z } from 'zod';

import {
  DECK_ASSET_TYPE,
  deckCardbackAssetDataSchema,
  FACTION_SHEET_ASSET_TYPE,
  factionSheetAssetDataSchema,
  TREACHERY_CARD_ASSET_TYPE,
  treacheryCardAssetDataSchema,
} from './publication';

const payloadHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Shared exact contract for the protected Convex producer and Browser capture consumer.
 *
 * The Publication asset type rides on the *envelope* rather than inside the payload, because Convex already holds it as a column on the job and rebuilds the envelope on every read.
 * Putting it in the payload would instead have rewritten the shape of every stored `asset_data` row, which is how a pending faction job survives this change untouched.
 *
 * The union is what lets the capture page dispatch: it fetches this once, before it renders anything, so the type is known by the time there is a subject to draw.
 */
export const publisherCaptureSnapshotSchema = z.discriminatedUnion('assetType', [
  z.strictObject({
    ok: z.literal(true),
    assetType: z.literal(FACTION_SHEET_ASSET_TYPE),
    payload: factionSheetAssetDataSchema,
    payloadHash: payloadHashSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    assetType: z.literal(TREACHERY_CARD_ASSET_TYPE),
    payload: treacheryCardAssetDataSchema,
    payloadHash: payloadHashSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    assetType: z.literal(DECK_ASSET_TYPE),
    payload: deckCardbackAssetDataSchema,
    payloadHash: payloadHashSchema,
  }),
]);

export type PublisherCaptureSnapshot = z.infer<typeof publisherCaptureSnapshotSchema>;
