import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { expect, test } from 'vitest';

import { inspectPublishedRulebookPdf } from './pdf-inspection';

async function fixture() {
  const document = await PDFDocument.create();
  document.addPage([700, 700]);
  document.addPage([700, 700]);
  return document.save({ useObjectStreams: true });
}

test('validates the compressed object table and reachable Pages of the final format', async () => {
  expect((await inspectPublishedRulebookPdf(await fixture())).pageCount).toBe(2);
});

test('rejects a broken startxref even when the full PDF parser repairs it', async () => {
  const bytes = await fixture();
  const text = new TextDecoder('latin1').decode(bytes);
  const match = /startxref\s+(\d+)\s+%%EOF/.exec(text)!;
  const corrupted = bytes.slice();
  corrupted.set(new TextEncoder().encode('0'.repeat(match[1].length)), match.index + match[0].indexOf(match[1]));
  expect((await PDFDocument.load(corrupted, { throwOnInvalidObject: true })).getPageCount()).toBe(2);
  await expect(inspectPublishedRulebookPdf(corrupted)).rejects.toThrow('exact object header');
});

test.each(['member-count', 'member-offset', 'xref-length', 'xref-width', 'missing-eof'])(
  'rejects corrupted compressed PDF structure: %s',
  async (kind) => {
    const bytes = await fixture();
    const text = new TextDecoder('latin1').decode(bytes);
    const corrupted = bytes.slice();
    if (kind === 'missing-eof') {
      await expect(inspectPublishedRulebookPdf(corrupted.subarray(0, corrupted.length - 10))).rejects.toThrow(
        'truncated'
      );
      return;
    }
    const pattern =
      kind === 'member-count'
        ? /\/N (\d+)/
        : kind === 'member-offset'
          ? /\/First (\d+)/
          : kind === 'xref-width'
            ? /\/W \[ (\d+)/
            : /\/Size (\d+)/;
    const match = pattern.exec(text)!;
    const changed = String(Number(match[1]) + 1).padStart(match[1].length, '0');
    expect(changed.length).toBe(match[1].length);
    corrupted.set(new TextEncoder().encode(changed), match.index + match[0].lastIndexOf(match[1]));
    await expect(inspectPublishedRulebookPdf(corrupted)).rejects.toThrow();
  }
);

test('retains tagged reading order when parsing compressed objects', async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([700, 700]);
  document.catalog.set(
    PDFName.of('StructTreeRoot'),
    document.context.register(
      document.context.obj({ Type: 'StructTreeRoot', K: { Type: 'StructElem', S: 'P', Pg: page.ref, K: 0 } })
    )
  );
  const bytes = await document.save({ useObjectStreams: true });
  expect((await inspectPublishedRulebookPdf(bytes)).pageCount).toBe(1);
  const parsed = await PDFDocument.load(bytes);
  const root = parsed.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  expect(parsed.context.lookup(root.lookup(PDFName.of('K'), PDFDict).get(PDFName.of('Pg')))).toBe(
    parsed.getPage(0).node
  );
});
