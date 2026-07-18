import { PDFDocument } from 'pdf-lib';

const POINTS_PER_MM = 72 / 25.4;
const MAX_PROOF_PDF_BYTES = 32 * 1024 * 1024;
const MAX_TRAILER_SCAN_BYTES = 4_096;
const MAX_CLASSIC_XREF_BYTES = 1_048_576;
const MAX_CLASSIC_XREF_ENTRIES = 100_000;
const decoder = new TextDecoder('latin1');

export type PdfInspection = {
  pageCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
};

function isPdfWhitespace(byte: number): boolean {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
}

type PdfEnvelope = {
  startxrefOffset: number;
  xrefOffset: number;
};

type ClassicXref = {
  entries: Map<number, ClassicXrefEntry>;
  rootGenerationNumber: number;
  rootObjectNumber: number;
  size: number;
};

type ClassicXrefEntry = {
  generationNumber: number;
  inUse: boolean;
  offset: number;
};

function assertCompletePdfEnvelope(bytes: Uint8Array): PdfEnvelope {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROOF_PDF_BYTES) {
    throw new Error(`Browser PDF size must be between 1 and ${MAX_PROOF_PDF_BYTES} bytes`);
  }
  if (decoder.decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('Browser output is not a PDF');
  }

  let significantEnd = bytes.length;
  while (significantEnd > 0 && isPdfWhitespace(bytes[significantEnd - 1])) {
    significantEnd -= 1;
  }
  const trailerStart = Math.max(0, significantEnd - MAX_TRAILER_SCAN_BYTES);
  const trailer = decoder.decode(bytes.subarray(trailerStart, significantEnd));
  const match = /startxref\s+(\d+)\s+%%EOF$/.exec(trailer);
  if (!match) {
    throw new Error('Browser PDF is truncated or has garbage after its final %%EOF');
  }
  const xrefOffset = Number(match[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 0 || xrefOffset >= significantEnd) {
    throw new Error('Browser PDF has an invalid startxref offset');
  }
  return {
    startxrefOffset: trailerStart + (match.index ?? 0),
    xrefOffset,
  };
}

function readLine(bytes: Uint8Array, from: number, end: number) {
  let lineEnd = from;
  while (lineEnd < end && bytes[lineEnd] !== 10 && bytes[lineEnd] !== 13) lineEnd += 1;
  let next = lineEnd;
  if (bytes[next] === 13) next += 1;
  if (bytes[next] === 10) next += 1;
  return {
    line: decoder.decode(bytes.subarray(from, lineEnd)),
    next,
  };
}

function assertObjectHeaderAt(
  bytes: Uint8Array,
  offset: number,
  objectNumber: number,
  generationNumber: number
): void {
  const header = decoder.decode(bytes.subarray(offset, Math.min(bytes.length, offset + 48)));
  const expected = new RegExp(`^${objectNumber}\\s+${generationNumber}\\s+obj\\b`);
  if (!expected.test(header)) {
    throw new Error(
      `Classic xref entry ${objectNumber} ${generationNumber} does not point to its exact object header`
    );
  }
}

function parseStrictClassicXref(bytes: Uint8Array, envelope: PdfEnvelope): ClassicXref {
  if (envelope.startxrefOffset - envelope.xrefOffset > MAX_CLASSIC_XREF_BYTES) {
    throw new Error('Classic xref section exceeds the proof validator bound');
  }
  let cursor = envelope.xrefOffset;
  const marker = readLine(bytes, cursor, envelope.startxrefOffset);
  if (marker.line !== 'xref') {
    throw new Error('startxref does not point to a classic xref table');
  }
  cursor = marker.next;

  const entries = new Map<number, ClassicXrefEntry>();
  let entryCount = 0;
  let foundTrailer = false;
  while (cursor < envelope.startxrefOffset) {
    const header = readLine(bytes, cursor, envelope.startxrefOffset);
    cursor = header.next;
    const trimmed = header.line.trim();
    if (trimmed === 'trailer') {
      foundTrailer = true;
      break;
    }
    if (trimmed.length === 0) continue;
    const subsection = /^(\d+)\s+(\d+)$/.exec(trimmed);
    if (!subsection) throw new Error('Classic xref subsection header is invalid');
    const firstObject = Number(subsection[1]);
    const count = Number(subsection[2]);
    if (
      !Number.isSafeInteger(firstObject) ||
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      entryCount + count > MAX_CLASSIC_XREF_ENTRIES
    ) {
      throw new Error('Classic xref subsection exceeds the proof validator bound');
    }

    for (let index = 0; index < count; index += 1) {
      const entryLine = readLine(bytes, cursor, envelope.startxrefOffset);
      cursor = entryLine.next;
      const entry = /^(\d{10})\s(\d{5})\s([fn])\s*$/.exec(entryLine.line);
      if (!entry) throw new Error('Classic xref entry is invalid');
      const objectNumber = firstObject + index;
      const generationNumber = Number(entry[2]);
      const objectOffset = Number(entry[1]);
      if (
        !Number.isSafeInteger(objectNumber) ||
        objectNumber < 0 ||
        objectNumber >= MAX_CLASSIC_XREF_ENTRIES
      ) {
        throw new Error('Classic xref contains an out-of-range object number');
      }
      if (entries.has(objectNumber)) {
        throw new Error(`Classic xref contains duplicate or overlapping object ${objectNumber}`);
      }
      if (entry[3] === 'n') {
        if (!Number.isSafeInteger(objectOffset) || objectOffset >= envelope.xrefOffset) {
          throw new Error('Classic xref in-use entry has an invalid object offset');
        }
        assertObjectHeaderAt(bytes, objectOffset, objectNumber, generationNumber);
      }
      entries.set(objectNumber, {
        generationNumber,
        inUse: entry[3] === 'n',
        offset: objectOffset,
      });
    }
    entryCount += count;
  }
  if (!foundTrailer) throw new Error('Classic xref table has no trailer');

  const trailer = decoder.decode(bytes.subarray(cursor, envelope.startxrefOffset));
  if (/\/(?:Prev|XRefStm)\b/.test(trailer)) {
    throw new Error('Incremental or hybrid xref PDFs are outside the Chromium proof contract');
  }
  const sizeMatch = /\/Size\s+(\d+)\b/.exec(trailer);
  if (!sizeMatch) throw new Error('Classic xref trailer has no Size');
  const size = Number(sizeMatch[1]);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_CLASSIC_XREF_ENTRIES) {
    throw new Error('Classic xref trailer Size exceeds the proof validator bound');
  }
  if (Array.from(entries.keys()).some((objectNumber) => objectNumber >= size)) {
    throw new Error('Classic xref contains an object number outside trailer Size');
  }
  if (entryCount !== size || entries.size !== size) {
    throw new Error('Classic xref does not contain exactly trailer Size entries');
  }
  for (let objectNumber = 0; objectNumber < size; objectNumber += 1) {
    if (!entries.has(objectNumber)) {
      throw new Error(`Classic xref is missing object ${objectNumber} required by trailer Size`);
    }
  }
  const zero = entries.get(0);
  if (!zero || zero.inUse || zero.generationNumber !== 65_535 || zero.offset !== 0) {
    throw new Error('Classic xref object 0 must be the canonical free entry');
  }
  const root = /\/Root\s+(\d+)\s+(\d+)\s+R\b/.exec(trailer);
  if (!root) throw new Error('Classic xref trailer has no Root reference');
  const rootObjectNumber = Number(root[1]);
  const rootGenerationNumber = Number(root[2]);
  const rootEntry = entries.get(rootObjectNumber);
  if (!rootEntry?.inUse || rootEntry.generationNumber !== rootGenerationNumber) {
    throw new Error('Classic xref trailer Root is not an in-use xref object');
  }
  return { entries, rootObjectNumber, rootGenerationNumber, size };
}

function sameDimensions(
  left: { width: number; height: number },
  right: { width: number; height: number }
): boolean {
  const tolerancePoints = 0.01;
  return (
    Math.abs(left.width - right.width) <= tolerancePoints &&
    Math.abs(left.height - right.height) <= tolerancePoints
  );
}

/** Fully parses a bounded PDF and inspects the reachable page tree and MediaBoxes. */
export async function inspectChromiumPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const envelope = assertCompletePdfEnvelope(bytes);
  const xref = parseStrictClassicXref(bytes, envelope);

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (error) {
    throw new Error(
      `PDF parser rejected browser output: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const catalogRef = document.context.getObjectRef(document.catalog);
  if (
    !catalogRef ||
    catalogRef.objectNumber !== xref.rootObjectNumber ||
    catalogRef.generationNumber !== xref.rootGenerationNumber
  ) {
    throw new Error('Parsed catalog does not match the classic xref trailer Root');
  }

  const parsedObjectNumbers = new Set<number>();
  for (const [ref] of document.context.enumerateIndirectObjects()) {
    const entry = xref.entries.get(ref.objectNumber);
    if (
      ref.objectNumber >= xref.size ||
      !entry?.inUse ||
      entry.generationNumber !== ref.generationNumber
    ) {
      throw new Error(`Parsed indirect object ${ref} has no exact in-use classic xref entry`);
    }
    parsedObjectNumbers.add(ref.objectNumber);
  }
  for (const [objectNumber, entry] of xref.entries) {
    if (entry.inUse && !parsedObjectNumbers.has(objectNumber)) {
      throw new Error(`Classic xref in-use object ${objectNumber} was not parsed`);
    }
  }

  const pages = document.getPages();
  if (pages.length === 0) {
    throw new Error('PDF page tree contains no reachable pages');
  }
  const boxes = pages.map((page) => page.getMediaBox());
  const firstBox = boxes[0];
  if (boxes.some((box) => !sameDimensions(firstBox, box))) {
    throw new Error('PDF pages have mixed effective MediaBox dimensions');
  }

  return {
    pageCount: pages.length,
    pageWidthMm: firstBox.width / POINTS_PER_MM,
    pageHeightMm: firstBox.height / POINTS_PER_MM,
  };
}
