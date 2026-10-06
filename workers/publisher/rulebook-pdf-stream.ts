import { Buffer } from 'node:buffer';

import type { BrowserContext, Page } from '@cloudflare/playwright';

import { RULEBOOK_PDF_RAW_MAX_BYTES, RULEBOOK_PDF_TRANSFER_BYTES } from '../../src/shared/rulebooks/pdfOptimization';
import { RULEBOOK_PDF_MAX_BYTES } from '../../src/shared/rulebooks/pdfPublication';
import { getRulebookSize } from '../../src/shared/rulebooks/settings';
import type { RulebookSize } from '../../src/shared/rulebooks/settings';

/** Moves the raw Chromium stream into browser memory without buffering the full capture in the Worker. */
export async function captureCompressedRulebookPdf(
  context: BrowserContext,
  page: Page,
  size: RulebookSize,
  pageCount: number,
  deadline: number
): Promise<Uint8Array> {
  async function withinDeadline<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Rulebook PDF capture exceeded its time budget')),
            Math.max(0, deadline - performance.now())
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const session = await withinDeadline(context.newCDPSession(page));
  let handle: string | undefined;
  try {
    const dimensions = getRulebookSize(size);
    await withinDeadline(page.emulateMedia({ media: 'print' }));
    const printed = await withinDeadline(
      session.send('Page.printToPDF', {
        transferMode: 'ReturnAsStream',
        paperWidth: dimensions.widthMm / 25.4,
        paperHeight: dimensions.heightMm / 25.4,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        displayHeaderFooter: false,
        printBackground: true,
        preferCSSPageSize: true,
        generateTaggedPDF: true,
        generateDocumentOutline: true,
      })
    );
    handle = printed.stream;
    if (!handle) {
      throw new Error('Chromium did not return a PDF stream');
    }
    let offset = 0;
    while (true) {
      const chunk = await withinDeadline(session.send('IO.read', { handle, size: RULEBOOK_PDF_TRANSFER_BYTES }));
      const bytes = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
      if (bytes.length > RULEBOOK_PDF_TRANSFER_BYTES || offset + bytes.length > RULEBOOK_PDF_RAW_MAX_BYTES) {
        throw new Error('Raw Rulebook PDF exceeds the capture size bound');
      }
      if (bytes.length) {
        await withinDeadline(
          page.evaluate(
            ({ offset, base64 }) => {
              if (!globalThis.rulebookPdfOptimizer) {
                throw new Error('Rulebook PDF optimizer is unavailable');
              }
              globalThis.rulebookPdfOptimizer.append(offset, base64);
            },
            { offset, base64: bytes.toString('base64') }
          )
        );
        offset += bytes.length;
      }
      if (chunk.eof) {
        break;
      }
      if (!bytes.length) {
        throw new Error('Chromium returned an empty unfinished PDF stream');
      }
    }
    await withinDeadline(session.send('IO.close', { handle }));
    handle = undefined;
    const result = await withinDeadline(
      page.evaluate(async (pageCount) => {
        if (!globalThis.rulebookPdfOptimizer) {
          throw new Error('Rulebook PDF optimizer is unavailable');
        }
        return await globalThis.rulebookPdfOptimizer.finish(pageCount);
      }, pageCount)
    );
    if (
      !Number.isSafeInteger(result.bytes) ||
      result.bytes < 1 ||
      result.bytes > RULEBOOK_PDF_MAX_BYTES ||
      result.pages !== pageCount
    ) {
      throw new Error('Compressed Rulebook PDF has invalid dimensions');
    }
    const output = new Uint8Array(result.bytes);
    for (let offset = 0; offset < result.bytes;) {
      const encoded = await withinDeadline(
        page.evaluate((offset) => {
          if (!globalThis.rulebookPdfOptimizer) {
            throw new Error('Rulebook PDF optimizer is unavailable');
          }
          return globalThis.rulebookPdfOptimizer.read(offset);
        }, offset)
      );
      if (encoded.length > Math.ceil(RULEBOOK_PDF_TRANSFER_BYTES / 3) * 4) {
        throw new Error('PDF output chunk exceeds its size bound');
      }
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.length !== Math.min(RULEBOOK_PDF_TRANSFER_BYTES, result.bytes - offset)) {
        throw new Error('PDF output stream is truncated or oversized');
      }
      output.set(bytes, offset);
      offset += bytes.length;
    }
    return output;
  } finally {
    /* The caller also closes the context, including a print command that outlives its deadline. */
    if (handle) {
      await withinDeadline(session.send('IO.close', { handle })).catch(() => undefined);
    }
    await withinDeadline(session.detach()).catch(() => undefined);
  }
}
