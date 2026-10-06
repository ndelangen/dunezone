import type { PDFDocument } from 'pdf-lib';
import { PDFDict, PDFName, PDFRawStream } from 'pdf-lib';

import { binaryBytes, contentTokens, deflate, digest, pageContent } from './content';
import { drawingBounds, identity, matrix, multiply } from './geometry';
import type { Matrix } from './geometry';

const name = PDFName.of;
const vectorOperators = new Set(
  'q Q cm w J j M d ri i gs m l c v y h re S s f F f* B B* b b* n W W* G g RG rg K k'.split(' ')
);
const paintOperators = new Set('S s f F f* B B* b b* n'.split(' '));
const pathOperators = new Set('m l c v y h re'.split(' '));
type Replacement = { start: number; end: number; value: string };
type PageDrawing = { index: number; raw: string; replacements: Replacement[] };
type Drawing = {
  page: PageDrawing;
  start: number;
  end: number;
  text: string;
  states: PDFDict;
  bounds: number[];
};

/** Shares repeated, unmarked vector drawings while retaining their exact coordinates. */
export async function shareDrawings(document: PDFDocument): Promise<number> {
  const groups = new Map<string, Drawing[]>();
  const pages: PageDrawing[] = [];
  for (const [index, page] of document.getPages().entries()) {
    const entry = { index, raw: pageContent(document, index), replacements: [] };
    pages.push(entry);
    const tokens = contentTokens(entry.raw);
    const stack: { start: number; token: number; eligible: boolean; transform: Matrix }[] = [];
    let pendingPath = false;
    let markedDepth = 0;
    let transform = identity;
    const operands: number[] = [];
    for (const [tokenIndex, token] of tokens.entries()) {
      if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(token.value)) {
        operands.push(Number(token.value));
        continue;
      }
      if (token.value === 'cm') {
        transform = multiply(transform, matrix(operands));
      }
      operands.length = 0;
      if (token.value === 'BDC' || token.value === 'BMC') {
        markedDepth += 1;
      }
      if (token.value === 'EMC') {
        markedDepth -= 1;
      }
      if (token.value === 'q') {
        stack.push({ start: token.start, token: tokenIndex, eligible: !pendingPath && markedDepth === 0, transform });
      }
      if (pathOperators.has(token.value)) {
        pendingPath = true;
      }
      if (paintOperators.has(token.value)) {
        pendingPath = false;
      }
      if (token.value !== 'Q') {
        continue;
      }
      const opening = stack.pop();
      if (!opening) {
        throw new Error('PDF has an unbalanced graphics state');
      }
      transform = opening.transform;
      const bounds = drawingBounds(page.getMediaBox(), opening.transform);
      if (!bounds) {
        continue;
      }
      if (!opening.eligible || pendingPath || token.end - opening.start < 1000) {
        continue;
      }
      const operators = tokens.slice(opening.token, tokenIndex + 1);
      if (
        operators.some(
          ({ value }) =>
            !vectorOperators.has(value) &&
            !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value) &&
            !value.startsWith('/') &&
            value !== '[' &&
            value !== ']'
        )
      ) {
        continue;
      }
      const resources = page.node.Resources()?.lookupMaybe(name('ExtGState'), PDFDict);
      const states = document.context.obj({});
      let valid = true;
      for (const [position, operator] of operators.entries()) {
        if (!operator.value.startsWith('/')) {
          continue;
        }
        if (operators[position + 1]?.value !== 'gs') {
          valid = false;
          break;
        }
        const key = name(operator.value.slice(1));
        const state = resources?.get(key);
        if (!state) {
          valid = false;
          break;
        }
        states.set(key, state);
      }
      if (!valid) {
        continue;
      }
      const text = entry.raw.slice(opening.start, token.end);
      const key = await digest(binaryBytes(text + '\n' + states.toString()));
      const group = groups.get(key) ?? [];
      group.push({ page: entry, start: opening.start, end: token.end, text, states, bounds });
      groups.set(key, group);
    }
    if (stack.length) {
      throw new Error('PDF has an unclosed graphics state');
    }
  }
  let shared = 0;
  const ordered = [...groups.values()].sort(
    (left, right) => right[0].text.length * (right.length - 1) - left[0].text.length * (left.length - 1)
  );
  for (const group of ordered) {
    const eligible = group.filter((drawing) =>
      drawing.page.replacements.every(
        (replacement) => drawing.end <= replacement.start || drawing.start >= replacement.end
      )
    );
    if (eligible.length < 2) {
      continue;
    }
    const first = eligible[0];
    const stream = document.context.flateStream(binaryBytes(first.text), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [
        Math.min(...eligible.map(({ bounds }) => bounds[0])),
        Math.min(...eligible.map(({ bounds }) => bounds[1])),
        Math.max(...eligible.map(({ bounds }) => bounds[2])),
        Math.max(...eligible.map(({ bounds }) => bounds[3])),
      ],
      Resources: document.context.obj({ ExtGState: first.states }),
    });
    const ref = document.context.register(stream);
    for (const drawing of eligible) {
      const page = document.getPage(drawing.page.index);
      const resources = (page.node.Resources() ?? document.context.obj({})).clone(document.context);
      const objects = (resources.lookupMaybe(name('XObject'), PDFDict) ?? document.context.obj({})).clone(
        document.context
      );
      let suffix = shared;
      while (objects.has(name(`SharedDrawing${suffix}`))) {
        suffix += 1;
      }
      const key = name(`SharedDrawing${suffix}`);
      objects.set(key, ref);
      resources.set(name('XObject'), objects);
      page.node.set(name('Resources'), resources);
      drawing.page.replacements.push({ start: drawing.start, end: drawing.end, value: `${key} Do` });
    }
    shared += 1;
  }
  for (const page of pages) {
    if (!page.replacements.length) {
      continue;
    }
    let text = page.raw;
    for (const replacement of page.replacements.sort((left, right) => right.start - left.start)) {
      text = text.slice(0, replacement.start) + replacement.value + text.slice(replacement.end);
    }
    const stream = PDFRawStream.of(document.context.obj({ Filter: 'FlateDecode' }), await deflate(binaryBytes(text)));
    document.getPage(page.index).node.set(name('Contents'), document.context.register(stream));
  }
  return shared;
}
