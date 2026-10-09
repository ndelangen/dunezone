import { z } from 'zod';

import { rulebookPdfCaptureSnapshotSchema } from '../rulebooks/pdfPublication';
import { factionLeaderAssetDataSchema } from './componentPublication';
import { factionAllianceAssetDataSchema, factionTraitorAssetDataSchema } from './factionCardPublication';
import { factionTroopAssetDataSchema } from './factionTroopPublication';
import {
  CUSTOM_CARD_ASSET_TYPE,
  customCardAssetDataSchema,
  boardAssetDataSchema,
  DECK_ASSET_TYPE,
  deckCardbackAssetDataSchema,
  FACTION_SHEET_ASSET_TYPE,
  factionSheetAssetDataSchema,
  factionTokenAssetDataSchema,
  RECTANGLE_TOKEN_ASSET_TYPE,
  rectangleTokenFaceAssetDataSchema,
  ROUND_TOKEN_ASSET_TYPES,
  RULEBOOK_FIRST_PAGE_ASSET_TYPE,
  rulebookFirstPageAssetDataSchema,
  SPICE_CARD_ASSET_TYPE,
  spiceCardAssetDataSchema,
  tokenFaceAssetDataSchema,
  TREACHERY_CARD_ASSET_TYPE,
  treacheryCardAssetDataSchema,
} from './publication';

const payloadHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** One asset type's envelope: its payload schema under its type, with the hash of what was rendered. */
function captureSnapshot<const AssetType extends string, Payload extends z.ZodType>(
  assetType: AssetType,
  payload: Payload
) {
  return z.strictObject({
    ok: z.literal(true),
    assetType: z.literal(assetType),
    payload,
    payloadHash: payloadHashSchema,
  });
}

/**
 * Shared exact contract for the protected Convex producer and Browser capture consumer.
 *
 * The Publication asset type rides on the *envelope* rather than inside the payload, because Convex already holds it as a column on the job and rebuilds the envelope on every read.
 * Putting it in the payload would instead have rewritten the shape of every stored `asset_data` row, which is how a pending faction job survives this change untouched.
 *
 * The union is what lets the capture page dispatch: it fetches this once, before it renders anything, so the type is known by the time there is a subject to draw.
 */
export const publisherCaptureSnapshotSchema = z.discriminatedUnion('assetType', [
  captureSnapshot('board', boardAssetDataSchema),
  captureSnapshot('faction-token', factionTokenAssetDataSchema),
  captureSnapshot('faction-troop', factionTroopAssetDataSchema),
  captureSnapshot('faction-traitor', factionTraitorAssetDataSchema),
  captureSnapshot('faction-alliance', factionAllianceAssetDataSchema),
  captureSnapshot('faction-leader', factionLeaderAssetDataSchema),
  captureSnapshot(FACTION_SHEET_ASSET_TYPE, factionSheetAssetDataSchema),
  captureSnapshot(TREACHERY_CARD_ASSET_TYPE, treacheryCardAssetDataSchema),
  captureSnapshot(SPICE_CARD_ASSET_TYPE, spiceCardAssetDataSchema),
  captureSnapshot(CUSTOM_CARD_ASSET_TYPE, customCardAssetDataSchema),
  z.strictObject({
    ok: z.literal(true),
    assetType: z.enum([DECK_ASSET_TYPE, 'cardback-preset']),
    payload: deckCardbackAssetDataSchema,
    payloadHash: payloadHashSchema,
  }),
  /* The three slotted shapes share one payload, since they differ only in the clip the capture frame draws through. */
  ...ROUND_TOKEN_ASSET_TYPES.map((assetType) =>
    z.strictObject({
      ok: z.literal(true),
      assetType: z.literal(assetType),
      payload: tokenFaceAssetDataSchema,
      payloadHash: payloadHashSchema,
    })
  ),
  captureSnapshot(RECTANGLE_TOKEN_ASSET_TYPE, rectangleTokenFaceAssetDataSchema),
  captureSnapshot(RULEBOOK_FIRST_PAGE_ASSET_TYPE, rulebookFirstPageAssetDataSchema),
  rulebookPdfCaptureSnapshotSchema,
]);

export type PublisherCaptureSnapshot = z.infer<typeof publisherCaptureSnapshotSchema>;
