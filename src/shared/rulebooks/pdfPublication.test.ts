import { describe, expect, test } from 'vitest';

import { RULEBOOK_PDF_MAX_PAGES } from './pdfOptimization';
import { planRulebookPdfBatches } from './pdfPublication';
import { createRulebookRenderDocumentFixture } from './renderDocument.fixture';

describe('Rulebook PDF batch planning', () => {
  test('captures the complete frozen Page order in one document', () => {
    const fixture = createRulebookRenderDocumentFixture();
    const page = fixture.pagesById[fixture.pageOrder[0]];
    if (!page) {
      throw new Error('Expected fixture Page');
    }
    const pageOrder = Array.from({ length: RULEBOOK_PDF_MAX_PAGES }, (_, index) => `page-${index}`);
    const document = {
      schemaVersion: 1 as const,
      settings: { size: 'tall' as const, design: 'restrained' as const },
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

    expect(() =>
      planRulebookPdfBatches(
        { artifactId: 'a', editionId: 'e', rulebookId: 'r', editionNumber: 1 },
        { ...document, pageOrder: [...pageOrder, 'extra'] }
      )
    ).toThrow('between 1 and 100');
    expect(batches.map(({ document: batch }) => batch.pageOrder.length)).toEqual([100]);
    expect(batches.flatMap(({ document: batch }) => batch.pageOrder)).toEqual(pageOrder);
    expect(batches.map(({ pageOffset }) => pageOffset)).toEqual([0]);
    expect(batches.map(({ batchIndex }) => batchIndex)).toEqual([0]);
    expect(batches.map(({ document: batch }) => batch.settings)).toEqual([document.settings]);
  });
});
