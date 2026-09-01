import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import { planRulebookPdfBatches } from '../../src/shared/rulebooks/pdfPublication';
import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { inspectChromiumPdf } from './pdf-inspection';
import { composeRulebookPdf } from './rulebook-pdf';

const A4 = { width: (210 * 72) / 25.4, height: (297 * 72) / 25.4 };

function fivePageDocument() {
  const fixture = createRulebookRenderDocumentFixture();
  const source = fixture.pagesById[fixture.pageOrder[0]];
  if (!source) {
    throw new Error('Expected fixture Page');
  }
  const pageOrder = ['page-a', 'page-b', 'page-c', 'page-d', 'page-e'];
  return {
    schemaVersion: 1 as const,
    pageOrder,
    pagesById: Object.fromEntries(
      pageOrder.map((id) => [id, { ...structuredClone(source), id, anchor: id, title: id }])
    ),
  };
}

async function capturedPdf(labels: string[]) {
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = document.addPage([A4.width, A4.height]);
    page.drawText(label, { x: 36, y: A4.height - 48, font, size: 12 });
  }
  return await document.save({ addDefaultPage: false, useObjectStreams: false });
}

describe('Rulebook PDF composition', () => {
  test('merges a full and short final batch into the frozen Page order', async () => {
    const document = fivePageDocument();
    const job = {
      artifactId: 'artifact-one',
      editionId: 'edition-one',
      rulebookId: 'rulebook-one',
      editionNumber: 1,
      editionCreatedAt: '2026-09-01T12:00:00.000Z',
      rulebookName: 'Field manual',
      document,
    };
    const batches = planRulebookPdfBatches(
      {
        artifactId: job.artifactId,
        editionId: job.editionId,
        rulebookId: job.rulebookId,
        editionNumber: job.editionNumber,
      },
      document
    );
    const bytes = await composeRulebookPdf(
      job,
      await Promise.all(batches.map(async (batch) => ({ batch, bytes: await capturedPdf(batch.document.pageOrder) })))
    );

    await expect(inspectChromiumPdf(bytes)).resolves.toMatchObject({ pageCount: 5 });
    const parsed = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(parsed.getTitle()).toBe('Field manual');
    expect(parsed.getPages()).toHaveLength(5);
  });

  test('rejects a missing batch and malformed bytes before publishing', async () => {
    const document = fivePageDocument();
    const job = {
      artifactId: 'artifact-one',
      editionId: 'edition-one',
      rulebookId: 'rulebook-one',
      editionNumber: 1,
      editionCreatedAt: '2026-09-01T12:00:00.000Z',
      rulebookName: 'Field manual',
      document,
    };
    const batches = planRulebookPdfBatches(
      {
        artifactId: job.artifactId,
        editionId: job.editionId,
        rulebookId: job.rulebookId,
        editionNumber: job.editionNumber,
      },
      document
    );
    await expect(
      composeRulebookPdf(job, [{ batch: batches[0], bytes: await capturedPdf(batches[0].document.pageOrder) }])
    ).rejects.toThrow('do not cover every frozen Edition Page');
    await expect(composeRulebookPdf(job, [{ batch: batches[0], bytes: new Uint8Array([1, 2, 3]) }])).rejects.toThrow(
      'batch merge failed'
    );
  });
});
