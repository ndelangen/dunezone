import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

import { RULEBOOK_PDF_MAX_BYTES } from '../../src/shared/rulebooks/pdfPublication';
import type { AssignedRulebookPdfJob, RulebookPdfCaptureBatch } from '../../src/shared/rulebooks/pdfPublication';
import { inspectChromiumPdf } from './pdf-inspection';
import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

const { pdf: PDF_CONTRACT } = PUBLISHER_RENDERER_CONTRACT;

export class RulebookPdfGenerationError extends Error {}

export type CapturedRulebookPdfBatch = {
  batch: RulebookPdfCaptureBatch;
  bytes: Uint8Array;
};

type PageResourceProfile = {
  fonts: number;
  images: number;
  links: number;
};

function dictionarySize(dictionary: PDFDict | undefined) {
  return dictionary?.keys().length ?? 0;
}

function pageResourceProfile(document: PDFDocument): PageResourceProfile[] {
  return document.getPages().map((page) => {
    const resources = page.node.Resources();
    const fonts = resources?.lookupMaybe(PDFName.Font, PDFDict);
    const xObjects = resources?.lookupMaybe(PDFName.XObject, PDFDict);
    let images = 0;
    for (const [, value] of xObjects?.entries() ?? []) {
      const resolved = document.context.lookup(value);
      if (
        resolved instanceof PDFRawStream &&
        resolved.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() === 'Image'
      ) {
        images += 1;
      }
    }
    const annotations = page.node.Annots();
    let links = 0;
    for (let index = 0; index < (annotations?.size() ?? 0); index += 1) {
      const annotation = annotations?.lookupMaybe(index, PDFDict);
      if (annotation?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText() === 'Link') {
        links += 1;
      }
    }
    return { fonts: dictionarySize(fonts), images, links };
  });
}

function assertA4(inspection: { pageWidthMm: number; pageHeightMm: number }) {
  if (
    Math.abs(inspection.pageWidthMm - PDF_CONTRACT.pageWidthMm) > PDF_CONTRACT.pageSizeToleranceMm ||
    Math.abs(inspection.pageHeightMm - PDF_CONTRACT.pageHeightMm) > PDF_CONTRACT.pageSizeToleranceMm
  ) {
    throw new RulebookPdfGenerationError('Rulebook PDF batch has invalid A4 MediaBoxes');
  }
}

function assertBatchIdentity(
  job: AssignedRulebookPdfJob,
  captured: CapturedRulebookPdfBatch,
  expectedBatchIndex: number,
  expectedPageOffset: number
) {
  const { batch } = captured;
  if (
    batch.artifactId !== job.artifactId ||
    batch.editionId !== job.editionId ||
    batch.rulebookId !== job.rulebookId ||
    batch.editionNumber !== job.editionNumber ||
    batch.batchIndex !== expectedBatchIndex ||
    batch.pageOffset !== expectedPageOffset
  ) {
    throw new RulebookPdfGenerationError('Rulebook PDF batch identity or order is inconsistent');
  }
  const expectedPageIds = job.document.pageOrder.slice(
    expectedPageOffset,
    expectedPageOffset + batch.document.pageOrder.length
  );
  if (JSON.stringify(batch.document.pageOrder) !== JSON.stringify(expectedPageIds)) {
    throw new RulebookPdfGenerationError('Rulebook PDF batch Pages do not match the frozen Edition order');
  }
}

function fixedEditionDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new RulebookPdfGenerationError('Rulebook Edition creation time is invalid');
  }
  return date;
}

/** Copies each captured batch into one deterministic PDF and proves that every Page resource survived the merge. */
export async function composeRulebookPdf(
  job: AssignedRulebookPdfJob,
  capturedBatches: CapturedRulebookPdfBatch[]
): Promise<Uint8Array> {
  if (capturedBatches.length === 0) {
    throw new RulebookPdfGenerationError('Rulebook PDF has no captured batches');
  }

  const output = await PDFDocument.create({ updateMetadata: false });
  output.setTitle(job.rulebookName);
  output.setAuthor('Dune Zone');
  output.setCreator('Dune Zone Rulebook publisher');
  output.setProducer('Dune Zone Rulebook publisher');
  const editionDate = fixedEditionDate(job.editionCreatedAt);
  output.setCreationDate(editionDate);
  output.setModificationDate(editionDate);

  const expectedProfiles: PageResourceProfile[] = [];
  let expectedPageOffset = 0;
  try {
    for (const [batchIndex, captured] of capturedBatches.entries()) {
      assertBatchIdentity(job, captured, batchIndex, expectedPageOffset);
      const inspection = await inspectChromiumPdf(captured.bytes);
      if (inspection.pageCount !== captured.batch.document.pageOrder.length) {
        throw new RulebookPdfGenerationError('Rulebook PDF batch page count does not match its Page slice');
      }
      assertA4(inspection);
      const source = await PDFDocument.load(captured.bytes, {
        ignoreEncryption: false,
        throwOnInvalidObject: true,
        updateMetadata: false,
      });
      expectedProfiles.push(...pageResourceProfile(source));
      for (const page of await output.copyPages(source, source.getPageIndices())) {
        output.addPage(page);
      }
      expectedPageOffset += inspection.pageCount;
    }
  } catch (error) {
    if (error instanceof RulebookPdfGenerationError) {
      throw error;
    }
    throw new RulebookPdfGenerationError('Rulebook PDF batch merge failed', { cause: error });
  }

  if (expectedPageOffset !== job.document.pageOrder.length) {
    throw new RulebookPdfGenerationError('Rulebook PDF batches do not cover every frozen Edition Page');
  }

  const bytes = await output.save({ addDefaultPage: false, useObjectStreams: false });
  if (bytes.byteLength === 0 || bytes.byteLength > RULEBOOK_PDF_MAX_BYTES) {
    throw new RulebookPdfGenerationError(`Rulebook PDF must be between 1 and ${RULEBOOK_PDF_MAX_BYTES} bytes`);
  }
  const inspection = await inspectChromiumPdf(bytes);
  if (inspection.pageCount !== job.document.pageOrder.length) {
    throw new RulebookPdfGenerationError('Composed Rulebook PDF page count does not match its frozen Edition');
  }
  assertA4(inspection);
  const composed = await PDFDocument.load(bytes, { updateMetadata: false });
  if (JSON.stringify(pageResourceProfile(composed)) !== JSON.stringify(expectedProfiles)) {
    throw new RulebookPdfGenerationError('Rulebook PDF merge changed Page fonts, images, or links');
  }
  if (expectedProfiles.some(({ fonts }) => fonts === 0)) {
    throw new RulebookPdfGenerationError('Every Rulebook PDF Page must carry an embedded font resource');
  }
  return bytes;
}
