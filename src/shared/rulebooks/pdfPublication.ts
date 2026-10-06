import { z } from 'zod';

import { RULEBOOK_PDF_MAX_PAGES } from './pdfOptimization';
import { rulebookRenderDocumentV1Schema } from './renderDocument';
import type { RulebookRenderDocumentV1 } from './renderDocument';

const RULEBOOK_PDF_MAX_BATCHES = 1;
export const RULEBOOK_PDF_MAX_BYTES = 16_000_000;
export const RULEBOOK_PDF_CAPTURE_TTL_MS = 360_000;

const rulebookPdfCaptureBatchSchema = z.strictObject({
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

/** Plans one complete frozen document without changing Page identity or order. */
export function planRulebookPdfBatches(
  identity: Omit<RulebookPdfCaptureBatch, 'batchIndex' | 'document' | 'pageOffset' | 'schemaVersion'>,
  document: RulebookRenderDocumentV1
): RulebookPdfCaptureBatch[] {
  if (document.pageOrder.length === 0 || document.pageOrder.length > RULEBOOK_PDF_MAX_PAGES) {
    throw new Error(`Rulebook PDFs require between 1 and ${RULEBOOK_PDF_MAX_PAGES} Pages`);
  }
  return [
    rulebookPdfCaptureBatchSchema.parse({
      schemaVersion: 1,
      ...identity,
      batchIndex: 0,
      pageOffset: 0,
      document,
    }),
  ];
}
