import { RULEBOOK_PDF_TRANSFER_BYTES } from '@shared/rulebooks/pdfOptimization';
import { PDFDict, PDFDocument, PDFName, PDFRef, StandardFonts } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import { binaryText, pageContent } from './content';
import { createRulebookPdfOptimizer } from './optimizer';

async function optimized(input: Uint8Array, pages: number) {
  const optimizer = createRulebookPdfOptimizer();
  for (let offset = 0; offset < input.length; offset += RULEBOOK_PDF_TRANSFER_BYTES) {
    optimizer.append(offset, btoa(binaryText(input.subarray(offset, offset + RULEBOOK_PDF_TRANSFER_BYTES))));
  }
  const result = await optimizer.finish(pages);
  const bytes = new Uint8Array(result.bytes);
  for (let offset = 0; offset < bytes.length; offset += RULEBOOK_PDF_TRANSFER_BYTES) {
    bytes.set(
      Uint8Array.from(atob(optimizer.read(offset)), (character) => character.charCodeAt(0)),
      offset
    );
  }
  return await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
}

describe('Rulebook PDF optimization', () => {
  test('preserves page text, tagged reading order, and destinations while removing unreachable objects', async () => {
    const document = await PDFDocument.create({ updateMetadata: false });
    const font = await document.embedFont(StandardFonts.Helvetica);
    const first = document.addPage([700, 700]);
    const second = document.addPage([700, 700]);
    first.drawText('First page', { font });
    second.drawText('Second page', { font });
    const structure = document.context.register(
      document.context.obj({ Type: 'StructTreeRoot', K: { Type: 'StructElem', S: 'P', Pg: first.ref, K: 0 } })
    );
    document.catalog.set(PDFName.of('StructTreeRoot'), structure);
    document.catalog.set(PDFName.of('OpenAction'), document.context.obj([second.ref, 'Fit']));
    document.context.register(document.context.obj({ Unreachable: true }));
    const input = await document.save({ useObjectStreams: false });
    const result = await optimized(input, 2);
    const original = await PDFDocument.load(input);
    expect(pageContent(result, 0)).toBe(pageContent(original, 0));
    expect(pageContent(result, 1)).toBe(pageContent(original, 1));
    const root = result.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const paragraph = root.lookup(PDFName.of('K'), PDFDict);
    expect(result.context.lookup(paragraph.get(PDFName.of('Pg')))).toBe(result.getPage(0).node);
    expect(
      result.context
        .enumerateIndirectObjects()
        .some(([, object]) => object instanceof PDFDict && object.has(PDFName.of('Unreachable')))
    ).toBe(false);
    expect(result.context.enumerateIndirectObjects().map(([ref]) => ref.objectNumber)).toEqual(
      Array.from({ length: result.context.enumerateIndirectObjects().length }, (_, index) => index + 1)
    );
  });

  test('does not extract graphics operators embedded in a literal string or tagged content', async () => {
    const document = await PDFDocument.create({ updateMetadata: false });
    const drawing = 'q\n' + '0 0 m 10 10 l S\n'.repeat(100) + 'Q';
    const text = `BT (${drawing}) Tj ET\n/P <</MCID 0>> BDC\n${drawing}\nEMC`;
    for (let index = 0; index < 2; index += 1) {
      const page = document.addPage([700, 700]);
      page.node.set(PDFName.Contents, document.context.register(document.context.flateStream(text)));
    }
    const result = await optimized(await document.save({ useObjectStreams: false }), 2);
    expect(pageContent(result, 0)).toBe(text);
    expect(pageContent(result, 1)).toBe(text);
  });

  test('rejects a dangling reference and out-of-order transfer chunks', async () => {
    const optimizer = createRulebookPdfOptimizer();
    expect(() => optimizer.append(1, 'YQ==')).toThrow('out of sequence');
    const document = await PDFDocument.create({ updateMetadata: false });
    document.addPage([700, 700]);
    document.catalog.set(PDFName.of('Broken'), PDFRef.of(999));
    await expect(optimized(await document.save({ useObjectStreams: false }), 1)).rejects.toThrow('dangling');
  });
});
