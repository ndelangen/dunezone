import { z } from 'zod';

import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type { RulebookRenderDocumentV1 } from './renderDocument';

/** Three image-bearing A4 Pages stay below the measured Chromium time and byte ceilings. */
export const RULEBOOK_PDF_BATCH_SIZE = 3;
export const RULEBOOK_PDF_MAX_BATCHES = 256;
export const RULEBOOK_PDF_MAX_BYTES = 8_000_000;
export const RULEBOOK_PDF_MAX_PICKUP = 1;
export const RULEBOOK_PDF_CAPTURE_TTL_MS = 360_000;

const assignedRulebookPdfJobSchema = z.strictObject({
  artifactId: z.string().min(1),
  editionId: z.string().min(1),
  rulebookId: z.string().min(1),
  editionNumber: z.number().int().positive(),
  editionCreatedAt: z.iso.datetime(),
  rulebookName: z.string().min(1),
  document: rulebookRenderDocumentV1Schema,
});

export type AssignedRulebookPdfJob = z.infer<typeof assignedRulebookPdfJobSchema>;

export const rulebookPdfCaptureBatchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  artifactId: z.string().min(1),
  editionId: z.string().min(1),
  rulebookId: z.string().min(1),
  editionNumber: z.number().int().positive(),
  batchIndex: z.number().int().nonnegative(),
  pageOffset: z.number().int().nonnegative(),
  document: rulebookRenderDocumentV1Schema,
});

export type RulebookPdfCaptureBatch = z.infer<typeof rulebookPdfCaptureBatchSchema>;

const payloadHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const rulebookPdfCaptureSnapshotSchema = z.strictObject({
  ok: z.literal(true),
  assetType: z.literal('rulebook-pdf-batch'),
  payload: rulebookPdfCaptureBatchSchema,
  payloadHash: payloadHashSchema,
});

export type RulebookPdfCaptureSnapshot = z.infer<typeof rulebookPdfCaptureSnapshotSchema>;

export const rulebookPdfCaptureBundleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expiresAt: z.number().int().positive(),
  batches: z.array(rulebookPdfCaptureSnapshotSchema).min(1).max(RULEBOOK_PDF_MAX_BATCHES),
});

export type RulebookPdfCaptureBundle = z.infer<typeof rulebookPdfCaptureBundleSchema>;

/** Splits one frozen document without changing Page identity or order. */
export function planRulebookPdfBatches(
  identity: Omit<RulebookPdfCaptureBatch, 'batchIndex' | 'document' | 'pageOffset' | 'schemaVersion'>,
  document: RulebookRenderDocumentV1
): RulebookPdfCaptureBatch[] {
  const batches: RulebookPdfCaptureBatch[] = [];
  for (let pageOffset = 0; pageOffset < document.pageOrder.length; pageOffset += RULEBOOK_PDF_BATCH_SIZE) {
    const pageOrder = document.pageOrder.slice(pageOffset, pageOffset + RULEBOOK_PDF_BATCH_SIZE);
    const pagesById = Object.fromEntries(
      pageOrder.map((pageId) => {
        const page = document.pagesById[pageId];
        if (!page) {
          throw new Error(`Rulebook PDF Page ${pageId} is missing from the render document`);
        }
        return [pageId, page];
      })
    );
    batches.push(
      rulebookPdfCaptureBatchSchema.parse({
        schemaVersion: 1,
        ...identity,
        batchIndex: batches.length,
        pageOffset,
        document: { schemaVersion: 1, pageOrder, pagesById },
      })
    );
  }
  if (batches.length > RULEBOOK_PDF_MAX_BATCHES) {
    throw new Error(`Rulebook PDF requires more than ${RULEBOOK_PDF_MAX_BATCHES} capture batches`);
  }
  return batches;
}

export const takeRulebookPdfWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
});

export const takeRulebookPdfWorkResponseSchema = z.strictObject({
  ok: z.literal(true),
  schemaVersion: z.literal(1),
  items: z.array(assignedRulebookPdfJobSchema).max(RULEBOOK_PDF_MAX_PICKUP),
});

export const completeRulebookPdfWorkRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  artifactId: z.string().min(1).max(128),
});

export const failRulebookPdfWorkRequestSchema = completeRulebookPdfWorkRequestSchema.extend({
  error: z.string().trim().min(1).max(2000),
});

export const rulebookPdfWorkOutcomeSchema = z.strictObject({
  ok: z.literal(true),
  status: z.enum(['ready', 'failed', 'missing']),
});

export const resolveRulebookPdfDeliveryRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rulebookId: z.string().min(1),
  editionNumber: z.number().int().positive(),
});

export const resolveRulebookPdfDeliveryResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ ok: z.literal(true), status: z.literal('missing') }),
  z.strictObject({
    ok: z.literal(true),
    status: z.literal('found'),
    editionNumber: z.number().int().positive(),
    key: z.string().min(1),
  }),
]);

export type RulebookPdfDeliveryResolution = z.infer<typeof resolveRulebookPdfDeliveryResponseSchema>;
