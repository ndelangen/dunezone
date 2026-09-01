import { describe, expect, test } from 'vitest';

import { planRulebookPdfBatches, RULEBOOK_PDF_BATCH_SIZE } from './pdfPublication';
import { createRulebookRenderDocumentFixture } from './renderDocument.fixture';

describe('Rulebook PDF batch planning', () => {
  test('keeps mixed batch sizes in the frozen Page order', () => {
    const fixture = createRulebookRenderDocumentFixture();
    const page = fixture.pagesById[fixture.pageOrder[0]];
    if (!page) {
      throw new Error('Expected fixture Page');
    }
    const pageOrder = Array.from({ length: RULEBOOK_PDF_BATCH_SIZE * 2 + 1 }, (_, index) => `page-${index}`);
    const document = {
      schemaVersion: 1 as const,
      pageOrder,
      pagesById: Object.fromEntries(
        pageOrder.map((pageId) => [pageId, { ...structuredClone(page), id: pageId, anchor: pageId }])
      ),
    };
    const batches = planRulebookPdfBatches(
      {
        artifactId: 'artifact-one',
        editionId: 'edition-one',
        rulebookId: 'rulebook-one',
        editionNumber: 3,
      },
      document
    );

    expect(batches.map(({ document: batch }) => batch.pageOrder.length)).toEqual([3, 3, 1]);
    expect(batches.flatMap(({ document: batch }) => batch.pageOrder)).toEqual(pageOrder);
    expect(batches.map(({ pageOffset }) => pageOffset)).toEqual([0, 3, 6]);
    expect(batches.map(({ batchIndex }) => batchIndex)).toEqual([0, 1, 2]);
  });
});
