import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, test, vi } from 'vitest';

import { CAPTURE_PROTOCOL } from '../../src/shared/asset-publishing/capture-protocol';
import { planRulebookPdfBatches } from '../../src/shared/rulebooks/pdfPublication';
import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { getRulebookSize } from '../../src/shared/rulebooks/settings';
import type { RulebookSize } from '../../src/shared/rulebooks/settings';
import { PublisherBrowserSession } from './browser';
import { pngBytes } from './test-helpers';

const HASH = 'a'.repeat(64);

async function pdfBytes(size: RulebookSize) {
  const dimensions = getRulebookSize(size);
  const document = await PDFDocument.create({ updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 3; index += 1) {
    document
      .addPage([(dimensions.widthMm * 72) / 25.4, (dimensions.heightMm * 72) / 25.4])
      .drawText(`Page ${index + 1}`, { x: 20, y: 20, font });
  }
  return await document.save({ addDefaultPage: false, useObjectStreams: false });
}

function captureBrowser(size: RulebookSize, output: Uint8Array, isPdf = false, reportedSize: string | null = size) {
  const dimensions = getRulebookSize(size);
  const width = isPdf ? (dimensions.widthMm * 96) / 25.4 : dimensions.widthMm * 4;
  const height = isPdf ? (dimensions.heightMm * 96) / 25.4 : dimensions.heightMm * 4;
  const readSize = vi.fn(async () => reportedSize);
  const contentLocator = (index = 0) => ({
    count: async () => (isPdf ? 3 : 1),
    nth: (next: number) => contentLocator(next),
    boundingBox: async () => ({ x: 0, y: index * height, width, height }),
    getAttribute: readSize,
  });
  const marker = {
    waitFor: async () => {},
    getAttribute: async (attribute: string) => (attribute === CAPTURE_PROTOCOL.marker.stateAttribute ? 'ready' : HASH),
    textContent: async () => '',
  };
  const page = {
    on: vi.fn(),
    goto: vi.fn(async () => ({ ok: () => true })),
    locator: (selector: string) => (selector === CAPTURE_PROTOCOL.marker.selector ? marker : contentLocator()),
    waitForFunction: vi.fn(async () => {}),
    evaluate: async () => ['0px', '0px', '0px', '0px'],
    emulateMedia: vi.fn(async () => {}),
    setViewportSize: vi.fn(async () => {}),
    screenshot: vi.fn(async () => output),
    pdf: vi.fn(async () => output),
  };
  const context = { newPage: async () => page, addCookies: async () => {}, close: vi.fn(async () => {}) };
  const browser = { newContext: async () => context, close: async () => {}, sessionId: () => 'capture-session' };
  return {
    session: new PublisherBrowserSession(browser as never, 'https://publisher.example.com'),
    page,
    context,
    readSize,
  };
}

function snapshot(size: RulebookSize) {
  const document = createRulebookRenderDocumentFixture();
  document.settings = { size, design: 'restrained' };
  const [payload] = planRulebookPdfBatches(
    { artifactId: 'artifact', editionId: 'edition', rulebookId: 'rulebook', editionNumber: 1 },
    document
  );
  return { ok: true as const, assetType: 'rulebook-pdf-batch' as const, payload, payloadHash: HASH };
}

describe('Rulebook browser capture', () => {
  test.each(['square', 'a4', 'tall'] as const)('captures a %s first Page at its chosen proportions', async (size) => {
    const dimensions = getRulebookSize(size);
    const bytes = pngBytes(dimensions.widthMm * 4, dimensions.heightMm * 4);
    const { session, page } = captureBrowser(size, bytes);
    await expect(session.capture('job', 'rulebook-first-page', 30_000)).resolves.toEqual({
      bytes,
      payloadHash: HASH,
      output: 'png',
    });
    expect(page.setViewportSize).toHaveBeenCalledWith({
      width: dimensions.widthMm * 4,
      height: dimensions.heightMm * 4,
    });
    expect(page.screenshot).toHaveBeenCalledOnce();
  });

  test('limits the first-page Size lookup to the remaining capture time', async () => {
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { session, page, readSize } = captureBrowser('a4', pngBytes(840, 1188));
      page.goto.mockImplementation(async () => {
        now = 5000;
        return { ok: () => true };
      });
      await session.capture('job', 'rulebook-first-page', 10_000);
      expect(readSize).toHaveBeenCalledWith('data-rulebook-size', { timeout: 6000 });
    } finally {
      clock.mockRestore();
    }
  });

  test('rejects first-page captures with missing Size or the wrong output dimensions', async () => {
    const missing = captureBrowser('square', pngBytes(1020, 1016), false, null);
    await expect(missing.session.capture('job', 'rulebook-first-page', 30_000)).rejects.toThrow(
      'did not expose its Size'
    );
    const wrong = captureBrowser('square', pngBytes(840, 1188));
    await expect(wrong.session.capture('job', 'rulebook-first-page', 30_000)).rejects.toThrow(
      'Captured PNG must be 1020x1016'
    );
  });

  test.each(['square', 'a4', 'tall'] as const)(
    'prints a %s PDF batch with the selected physical dimensions',
    async (size) => {
      const bytes = await pdfBytes(size);
      const dimensions = getRulebookSize(size);
      const { session, page, context } = captureBrowser(size, bytes, true);
      await expect(session.captureRulebookPdfBatch('token', snapshot(size), 30_000)).resolves.toEqual({
        bytes,
        payloadHash: HASH,
        output: 'pdf',
      });
      expect(page.pdf).toHaveBeenCalledWith(
        expect.objectContaining({ width: `${dimensions.widthMm}mm`, height: `${dimensions.heightMm}mm` })
      );
      expect(context.close).toHaveBeenCalledOnce();
    }
  );

  test('rejects PDF bytes with MediaBoxes from another Size', async () => {
    const { session, context } = captureBrowser('tall', await pdfBytes('a4'), true);
    await expect(session.captureRulebookPdfBatch('token', snapshot('tall'), 30_000)).rejects.toThrow(
      '105 x 297 mm MediaBoxes'
    );
    expect(context.close).toHaveBeenCalledOnce();
  });
});
