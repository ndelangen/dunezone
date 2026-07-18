import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';

import { inspectChromiumPdf } from './pdf-inspection';
import { incompleteClassicXrefPdf } from './pdf-inspection-test-fixtures';

const pointsPerMm = 72 / 25.4;

async function realPdf(pageSizes: ReadonlyArray<readonly [number, number]>): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (const size of pageSizes) {
    document.addPage([size[0], size[1]]);
  }
  return await document.save({ useObjectStreams: false });
}

function startxrefOffset(bytes: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(bytes);
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!match) throw new Error('Fixture has no startxref');
  return Number(match[1]);
}

test('parses a real reachable two-page PDF and reads its MediaBoxes', async () => {
  const pdf = await realPdf([
    [150 * pointsPerMm, 195 * pointsPerMm],
    [150 * pointsPerMm, 195 * pointsPerMm],
  ]);

  const inspection = await inspectChromiumPdf(pdf);
  expect(inspection.pageCount).toBe(2);
  expect(inspection.pageWidthMm).toBeCloseTo(150, 5);
  expect(inspection.pageHeightMm).toBeCloseTo(195, 5);
});

test('rejects a real two-page PDF whose second MediaBox has a different size', async () => {
  const pdf = await realPdf([
    [150 * pointsPerMm, 195 * pointsPerMm],
    [612, 792],
  ]);

  await expect(inspectChromiumPdf(pdf)).rejects.toThrow('mixed effective MediaBox dimensions');
});

test('rejects a truncated otherwise-real PDF', async () => {
  const pdf = await realPdf([[150 * pointsPerMm, 195 * pointsPerMm]]);
  const truncated = pdf.subarray(0, pdf.length - 12);

  await expect(inspectChromiumPdf(truncated)).rejects.toThrow('truncated');
});

test('rejects a real PDF whose classic xref table and trailer were removed', async () => {
  const pdf = await realPdf([[150 * pointsPerMm, 195 * pointsPerMm]]);
  const offset = startxrefOffset(pdf);
  const text = new TextDecoder('latin1').decode(pdf);
  const startxref = text.lastIndexOf('startxref');
  const corrupted = new Uint8Array(offset + (pdf.length - startxref));
  corrupted.set(pdf.subarray(0, offset));
  corrupted.set(pdf.subarray(startxref), offset);

  await expect(inspectChromiumPdf(corrupted)).rejects.toThrow(/startxref/);
});

test('rejects a real PDF with a wrong in-range startxref offset', async () => {
  const pdf = await realPdf([[150 * pointsPerMm, 195 * pointsPerMm]]);
  const text = new TextDecoder('latin1').decode(pdf);
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!match?.[1] || match.index === undefined) throw new Error('Fixture has no startxref');
  const wrongOffset = String(Number(match[1]) - 1).padStart(match[1].length, '0');
  const digitsOffset = match.index + match[0].indexOf(match[1]);
  const corrupted = pdf.slice();
  corrupted.set(new TextEncoder().encode(wrongOffset), digitsOffset);

  await expect(inspectChromiumPdf(corrupted)).rejects.toThrow(
    'startxref does not point to a classic xref table'
  );
});

test('rejects repairable Pages/Page objects omitted from an otherwise-valid classic xref', async () => {
  const pdf = incompleteClassicXrefPdf();
  const repaired = await PDFDocument.load(pdf, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  expect(repaired.getPageCount()).toBe(2);

  await expect(inspectChromiumPdf(pdf)).rejects.toThrow(
    'Classic xref does not contain exactly trailer Size entries'
  );
});

test('rejects duplicate or overlapping classic xref object coverage', async () => {
  const pdf = await realPdf([[150 * pointsPerMm, 195 * pointsPerMm]]);
  const xref = startxrefOffset(pdf);
  const xrefText = new TextDecoder('latin1').decode(pdf.subarray(xref));
  const objectOne = /xref\s+0\s+\d+\s+\d{10}\s\d{5}\sf\s+(\d{10}\s\d{5}\sn\s+)/.exec(xrefText)?.[1];
  const trailerRelative = xrefText.indexOf('\ntrailer\n');
  if (!objectOne || trailerRelative < 0) throw new Error('Fixture has no object 1 xref entry');
  const insertion = new TextEncoder().encode(`1 1\n${objectOne}`);
  const trailerOffset = xref + trailerRelative + 1;
  const corrupted = new Uint8Array(pdf.length + insertion.length);
  corrupted.set(pdf.subarray(0, trailerOffset));
  corrupted.set(insertion, trailerOffset);
  corrupted.set(pdf.subarray(trailerOffset), trailerOffset + insertion.length);

  await expect(inspectChromiumPdf(corrupted)).rejects.toThrow('duplicate or overlapping object 1');
});

test('rejects classic xref object numbers outside trailer Size', async () => {
  const pdf = await realPdf([[150 * pointsPerMm, 195 * pointsPerMm]]);
  const xref = startxrefOffset(pdf);
  const xrefText = new TextDecoder('latin1').decode(pdf.subarray(xref));
  const size = /\/Size\s+(\d+)/.exec(xrefText)?.[1];
  const trailerRelative = xrefText.indexOf('\ntrailer\n');
  if (!size || trailerRelative < 0) throw new Error('Fixture has no trailer Size');
  const insertion = new TextEncoder().encode(`${size} 1\n0000000000 00000 f \n`);
  const trailerOffset = xref + trailerRelative + 1;
  const corrupted = new Uint8Array(pdf.length + insertion.length);
  corrupted.set(pdf.subarray(0, trailerOffset));
  corrupted.set(insertion, trailerOffset);
  corrupted.set(pdf.subarray(trailerOffset), trailerOffset + insertion.length);

  await expect(inspectChromiumPdf(corrupted)).rejects.toThrow('object number outside trailer Size');
});

test('rejects non-whitespace garbage after the final PDF EOF marker', async () => {
  const pdf = await realPdf([[150 * pointsPerMm, 195 * pointsPerMm]]);
  const garbage = new TextEncoder().encode('\nasset-payload-garbage');
  const corrupted = new Uint8Array(pdf.length + garbage.length);
  corrupted.set(pdf);
  corrupted.set(garbage, pdf.length);

  await expect(inspectChromiumPdf(corrupted)).rejects.toThrow('garbage');
});

test('rejects a handcrafted reachable two-page pseudo-PDF with no xref table', async () => {
  const pseudoPdf = new TextEncoder().encode(
    [
      '%PDF-1.7',
      '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
      '2 0 obj <</Type /Pages /Count 2 /Kids [3 0 R 4 0 R]>> endobj',
      '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 425.19685 552.75591]>> endobj',
      '4 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 425.19685 552.75591]>> endobj',
      'startxref',
      '9',
      '%%EOF',
    ].join('\n')
  );

  await expect(inspectChromiumPdf(pseudoPdf)).rejects.toThrow(
    'startxref does not point to a classic xref table'
  );
});
