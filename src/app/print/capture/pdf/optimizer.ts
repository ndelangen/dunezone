import {
  RULEBOOK_PDF_MAX_PAGES,
  RULEBOOK_PDF_RAW_MAX_BYTES,
  RULEBOOK_PDF_TRANSFER_BYTES,
} from '@shared/rulebooks/pdfOptimization';
import type { RulebookPdfOptimizer } from '@shared/rulebooks/pdfOptimization';
import { RULEBOOK_PDF_MAX_BYTES } from '@shared/rulebooks/pdfPublication';
import { PDFDocument } from 'pdf-lib';

import { binaryBytes, binaryText } from './content';
import { shareDrawings } from './drawings';
import { compressImages } from './images';
import { compactObjects, shareImages } from './objects';

/** The browser owns the large input; the driver exchanges bounded chunks and receives only the compressed PDF. */
export function createRulebookPdfOptimizer(): RulebookPdfOptimizer {
  let chunks: Uint8Array[] = [];
  let length = 0;
  let started = false;
  let output: Uint8Array | undefined;
  return {
    append(offset, base64) {
      if (started || offset !== length || base64.length > Math.ceil(RULEBOOK_PDF_TRANSFER_BYTES / 3) * 4) {
        throw new Error('PDF input chunk is out of sequence or exceeds its bound');
      }
      const bytes = binaryBytes(atob(base64));
      if (
        !bytes.length ||
        bytes.length > RULEBOOK_PDF_TRANSFER_BYTES ||
        length + bytes.length > RULEBOOK_PDF_RAW_MAX_BYTES
      ) {
        throw new Error('PDF input exceeds the capture size bound');
      }
      chunks.push(bytes);
      length += bytes.length;
    },
    async finish(pageCount) {
      if (
        started ||
        !length ||
        !Number.isSafeInteger(pageCount) ||
        pageCount < 1 ||
        pageCount > RULEBOOK_PDF_MAX_PAGES
      ) {
        throw new Error('PDF optimization cannot start with this capture');
      }
      started = true;
      const raw = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        raw.set(chunk, offset);
        offset += chunk.length;
      }
      chunks = [];
      const document = await PDFDocument.load(raw, {
        updateMetadata: false,
        throwOnInvalidObject: true,
        ignoreEncryption: false,
      });
      if (document.getPageCount() !== pageCount) {
        throw new Error('PDF capture has the wrong page count');
      }
      await shareDrawings(document);
      await compressImages(document);
      await shareImages(document);
      await shareImages(document);
      compactObjects(document);
      output = await document.save({ useObjectStreams: false, addDefaultPage: false });
      if (!output.length || output.length > RULEBOOK_PDF_MAX_BYTES) {
        throw new Error('Compressed PDF exceeds the publication size bound');
      }
      return { bytes: output.length, pages: pageCount };
    },
    read(offset) {
      if (!output || !Number.isSafeInteger(offset) || offset < 0 || offset >= output.length) {
        throw new Error('PDF output chunk is out of range');
      }
      return btoa(binaryText(output.subarray(offset, offset + RULEBOOK_PDF_TRANSFER_BYTES)));
    },
  };
}
