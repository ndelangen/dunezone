import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { expect, test } from 'vitest';

import { contentTokens, decodedContent, pageContent } from './content';
import { shareFilledPaths } from './paths';

function shape(x: number) {
  const outside =
    `${x} 0 m\n` +
    Array.from({ length: 20 }, (_, index) => `${x + 20 + index / 20} ${index} l`).join('\n') +
    `\n${x} 20 l h\n`;
  const hole = `${x + 5} 5 m ${x + 5} 10 l ${x + 10} 10 l ${x + 10} 5 l h\n`;
  return outside + hole;
}

async function fixture(raw: string) {
  const document = await PDFDocument.create({ updateMetadata: false });
  const page = document.addPage([700, 700]);
  page.node.set(PDFName.Contents, document.context.register(document.context.flateStream(raw)));
  return document;
}

test('shares translated outlines while retaining holes in a single fill and leaving text untouched', async () => {
  const text = 'BT (searchable text) Tj ET';
  const document = await fixture([0, 50, 100].map((x) => shape(x) + 'f*').join('\n') + '\n' + text);
  expect(await shareFilledPaths(document)).toBe(1);
  expect(pageContent(document, 0)).toContain(text);
  const forms = document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFRawStream =>
        object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Form')
    );
  expect(forms).toHaveLength(1);
  const operators = contentTokens(decodedContent(forms[0])).map(({ value }) => value);
  expect(operators.filter((value) => value === 'm')).toHaveLength(2);
  expect(operators.filter((value) => value === 'f*')).toHaveLength(1);
});

test.each(['W f', 'S', 'B'])('leaves clipping and stroked paths unchanged for %s', async (paint) => {
  const raw = [0, 50, 100].map((x) => shape(x) + paint).join('\n');
  const document = await fixture(raw);
  expect(await shareFilledPaths(document)).toBe(0);
  expect(pageContent(document, 0)).toBe(raw);
});

test('does not drop an unsupported rectangle that precedes the recognized contours', async () => {
  const raw = [0, 50, 100].map((x) => `0 0 300 300 re\n${shape(x)}f`).join('\n');
  const document = await fixture(raw);
  expect(await shareFilledPaths(document)).toBe(0);
  expect(pageContent(document, 0)).toBe(raw);
});

test('retains individually tagged outlines and refuses to approximate at excessive magnification', async () => {
  for (const prefix of ['/P <</MCID 1>> BDC', '100 0 0 100 0 0 cm']) {
    const raw =
      prefix + '\n' + [0, 50, 100].map((x) => shape(x) + 'f').join('\n') + (prefix.startsWith('/P') ? '\nEMC' : '');
    const document = await fixture(raw);
    expect(await shareFilledPaths(document)).toBe(0);
    expect(pageContent(document, 0)).toBe(raw);
  }
});

test('does not translate a patterned fill and restores solid fill state after a saved graphics state', async () => {
  const drawing = [0, 50, 100].map((x) => shape(x) + 'f').join('\n');
  const patterned = `q /Pattern cs /PatternOne scn\n${drawing}\nQ`;
  const document = await fixture(patterned + '\n' + drawing);
  expect(await shareFilledPaths(document)).toBe(1);
  expect(pageContent(document, 0)).toContain(patterned);
});
