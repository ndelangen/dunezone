import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import { planRulebookPdfBatches } from '../../src/shared/rulebooks/pdfPublication';
import type { RulebookRenderPageByLayoutV1 } from '../../src/shared/rulebooks/renderDocument';
import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { getRulebookSize } from '../../src/shared/rulebooks/settings';
import type { RulebookSize } from '../../src/shared/rulebooks/settings';
import { inspectChromiumPdf } from './pdf-inspection';
import { composeRulebookPdf } from './rulebook-pdf';

function fivePageDocument(size: RulebookSize = 'a4') {
  const fixture = createRulebookRenderDocumentFixture();
  const source = fixture.pagesById[fixture.pageOrder[0]];
  if (!source) {
    throw new Error('Expected fixture Page');
  }
  const pageOrder = ['page-a', 'page-b', 'page-c', 'page-d', 'page-e'];
  return {
    schemaVersion: 1 as const,
    settings: { size, design: 'restrained' as const },
    pageOrder,
    pagesById: Object.fromEntries(
      pageOrder.map((id) => [id, { ...structuredClone(source), id, anchor: id, title: id }])
    ),
  };
}

async function capturedPdf(labels: (string | null)[], size: RulebookSize = 'a4') {
  const dimensions = getRulebookSize(size);
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  const image = await document.embedPng(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
  );
  for (const label of labels) {
    /* Model Chromium's physical-unit rounding so composition must restore the exact MediaBox. */
    const page = document.addPage([(dimensions.widthMm * 72) / 25.4 + 0.1, (dimensions.heightMm * 72) / 25.4 + 0.1]);
    if (label !== null) {
      page.drawText(label, { x: 36, y: page.getHeight() - 48, font, size: 12 });
    }
    page.drawImage(image, { x: 36, y: 36, width: 12, height: 12 });
    const link = document.context.register(
      document.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [36, 36, 48, 48],
        A: { S: 'URI', URI: PDFString.of(`https://dune.zone/${label}`) },
      })
    );
    page.node.set(PDFName.Annots, document.context.obj([link]));
  }
  return await document.save({ addDefaultPage: false, useObjectStreams: false });
}

function jobFor(size: RulebookSize = 'a4') {
  const document = fivePageDocument(size);
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
  return { job, batches };
}

describe('Rulebook PDF composition', () => {
  test('allows an image-only Cover while retaining the font check for visible text', async () => {
    const cover: RulebookRenderPageByLayoutV1<'cover'> = {
      id: 'CVER',
      anchor: 'cover',
      title: 'Hidden title',
      layoutId: 'cover',
      showHeading: false,
      controlValues: {
        cover: {
          artwork: { status: 'unselected' },
          backgroundImageUrl: 'https://dune.zone/user-images/cover.jpg',
          showDuneLogo: false,
          showSubtitle: false,
          subtitle: 'Hidden subtitle',
          supportingText: '',
        },
      },
      regions: [],
    };
    const { job } = jobFor();
    const document = { ...job.document, pageOrder: [cover.id], pagesById: { [cover.id]: cover } };
    const coverJob = { ...job, document };
    const identity = {
      artifactId: job.artifactId,
      editionId: job.editionId,
      rulebookId: job.rulebookId,
      editionNumber: job.editionNumber,
    };
    const [batch] = planRulebookPdfBatches(identity, document);
    const bytes = await capturedPdf([null]);
    const composed = await composeRulebookPdf(coverJob, [{ batch, bytes }]);
    expect((await inspectChromiumPdf(composed)).pageCount).toBe(1);
    const parsed = await PDFDocument.load(composed);
    expect(parsed.getPage(0).node.Resources()!.lookup(PDFName.XObject, PDFDict).keys()).toHaveLength(1);

    for (const visibleCover of [
      { ...cover, showHeading: true },
      { ...cover, controlValues: { cover: { ...cover.controlValues.cover, showSubtitle: true } } },
      { ...cover, controlValues: { cover: { ...cover.controlValues.cover, supportingText: 'Visible text' } } },
    ]) {
      const visibleDocument = { ...document, pagesById: { [cover.id]: visibleCover } };
      const visibleJob = { ...coverJob, document: visibleDocument };
      const [visibleBatch] = planRulebookPdfBatches(identity, visibleDocument);
      await expect(composeRulebookPdf(visibleJob, [{ batch: visibleBatch, bytes }])).rejects.toThrow(
        'embedded font resource'
      );
    }

    const { job: interiorJob, batches } = jobFor();
    await expect(
      composeRulebookPdf(
        interiorJob,
        await Promise.all(
          batches.map(async (batch) => ({ batch, bytes: await capturedPdf(batch.document.pageOrder.map(() => null)) }))
        )
      )
    ).rejects.toThrow('embedded font resource');
  });

  test.each(['square', 'a4', 'tall'] as const)(
    'composes exact %s Pages in order with fonts, images, and links',
    async (size) => {
      const { job, batches } = jobFor(size);
      const bytes = await composeRulebookPdf(
        job,
        await Promise.all(
          batches.map(async (batch) => ({
            batch,
            bytes: await capturedPdf(batch.document.pageOrder, size),
          }))
        )
      );
      const dimensions = getRulebookSize(size);
      const inspection = await inspectChromiumPdf(bytes);
      expect(inspection.pageCount).toBe(5);
      expect(inspection.pageWidthMm).toBeCloseTo(dimensions.widthMm, 12);
      expect(inspection.pageHeightMm).toBeCloseTo(dimensions.heightMm, 12);
      const parsed = await PDFDocument.load(bytes, { updateMetadata: false });
      expect(parsed.getTitle()).toBe('Field manual');
      expect(
        parsed.getPages().map((page) => {
          const resources = page.node.Resources()!;
          expect(resources.lookup(PDFName.Font, PDFDict).keys()).toHaveLength(1);
          expect(resources.lookup(PDFName.XObject, PDFDict).keys()).toHaveLength(1);
          const annotations = page.node.lookup(PDFName.Annots, PDFArray);
          return annotations
            .lookup(0, PDFDict)
            .lookup(PDFName.of('A'), PDFDict)
            .lookup(PDFName.of('URI'), PDFString)
            .decodeText();
        })
      ).toEqual(job.document.pageOrder.map((id) => `https://dune.zone/${id}`));
    }
  );

  test('rejects a missing batch and malformed bytes before publishing', async () => {
    const { job, batches } = jobFor();
    await expect(
      composeRulebookPdf(job, [{ batch: batches[0], bytes: await capturedPdf(batches[0].document.pageOrder) }])
    ).rejects.toThrow('do not cover every frozen Edition Page');
    await expect(composeRulebookPdf(job, [{ batch: batches[0], bytes: new Uint8Array([1, 2, 3]) }])).rejects.toThrow(
      'batch merge failed'
    );
  });

  test('rejects another Size or Design and a PDF with the wrong physical dimensions', async () => {
    const { job, batches } = jobFor('tall');
    const bytes = await capturedPdf(batches[0].document.pageOrder, 'tall');
    for (const settings of [
      { size: 'square' as const, design: 'restrained' as const },
      { size: 'tall' as const, design: 'illustrated' as const },
    ]) {
      const batch = { ...batches[0], document: { ...batches[0].document, settings } };
      await expect(composeRulebookPdf(job, [{ batch, bytes }])).rejects.toThrow('settings do not match');
    }
    await expect(
      composeRulebookPdf(job, [{ batch: batches[0], bytes: await capturedPdf(batches[0].document.pageOrder, 'a4') }])
    ).rejects.toThrow('MediaBoxes must match 105 x 297 mm');
  });
});
