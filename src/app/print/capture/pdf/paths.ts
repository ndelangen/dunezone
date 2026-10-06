import type { PDFDocument, PDFRef } from 'pdf-lib';
import { PDFDict, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

import { binaryBytes, contentTokens, deflate, pageContent } from './content';
import { identity, matrix, multiply } from './geometry';
import type { Matrix } from './geometry';

type Operation = { operator: string; values: number[] };
type Bounds = [number, number, number, number];
type Contour = { operations: Operation[]; bounds: Bounds };
type Shape = { operations: Operation[]; bounds: Bounds; operator: string; uses: Part[] };
type Part = { contours: Contour[]; bounds: Bounds; shape?: Shape };
type Fill = { start: number; end: number; operator: string; parts: Part[] };
const arities = new Map([
  ['m', 2],
  ['l', 2],
  ['c', 6],
  ['h', 0],
]);
const name = PDFName.of;

function union(left: Bounds, right: Bounds): Bounds {
  return [
    Math.min(left[0], right[0]),
    Math.min(left[1], right[1]),
    Math.max(left[2], right[2]),
    Math.max(left[3], right[3]),
  ];
}

function overlaps(left: Bounds, right: Bounds): boolean {
  return !(left[2] < right[0] || right[2] < left[0] || left[3] < right[1] || right[3] < left[1]);
}

/** Keeps holes and intersecting contours in one fill; separate parts have disjoint control-point bounds. */
function parts(contours: Contour[]): Part[] {
  const result: Part[] = [];
  for (const contour of contours) {
    const part: Part = { contours: [contour], bounds: contour.bounds };
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = result.length - 1; index >= 0; index -= 1) {
        if (overlaps(part.bounds, result[index].bounds)) {
          const other = result.splice(index, 1)[0];
          part.bounds = union(part.bounds, other.bounds);
          part.contours.push(...other.contours);
          changed = true;
        }
      }
    }
    part.contours.sort((left, right) => contours.indexOf(left) - contours.indexOf(right));
    result.push(part);
  }
  return result;
}

function serialize(operations: Operation[]): string {
  return operations
    .map(({ operator, values }) => `${values.map((value) => PDFNumber.of(value).toString()).join(' ')} ${operator}`)
    .join('\n');
}

/** Reuses translated filled outlines with at most 0.0001 point of coordinate error at each printed occurrence. */
export async function shareFilledPaths(document: PDFDocument): Promise<number> {
  const groups = new Map<string, Shape[]>();
  const pages: { index: number; raw: string; fills: Fill[] }[] = [];
  for (const [index] of document.getPages().entries()) {
    const raw = pageContent(document, index);
    const fills: Fill[] = [];
    pages.push({ index, raw, fills });
    let transform = identity;
    const stack: { transform: Matrix; solidFill: boolean }[] = [];
    let solidFill = true;
    const operands: number[] = [];
    let contours: Contour[] = [];
    let start = 0;
    let eligible = true;
    let markedDepth = 0;
    for (const token of contentTokens(raw)) {
      if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(token.value)) {
        if (!operands.length) {
          start = contours.length ? start : token.start;
        }
        operands.push(Number(token.value));
        continue;
      }
      const operator = token.value;
      if (operator === 'q') {
        stack.push({ transform, solidFill });
      }
      if (operator === 'Q') {
        const restored = stack.pop();
        transform = restored?.transform ?? identity;
        solidFill = restored?.solidFill ?? true;
      }
      if (['cs', 'sc', 'scn'].includes(operator)) {
        solidFill = false;
      }
      if (['g', 'rg', 'k'].includes(operator)) {
        solidFill = true;
      }
      if (operator === 'cm') {
        transform = multiply(transform, matrix(operands));
      }
      if (operator === 'BDC' || operator === 'BMC') {
        markedDepth += 1;
      }
      if (operator === 'EMC') {
        markedDepth -= 1;
      }
      if (arities.get(operator) === operands.length) {
        if (operator === 'm') {
          const [x, y] = operands;
          contours.push({ operations: [], bounds: [x, y, x, y] });
        }
        const contour = contours.at(-1);
        if (contour) {
          contour.operations.push({ operator, values: [...operands] });
          for (let offset = 0; offset < operands.length; offset += 2) {
            const x = operands[offset];
            const y = operands[offset + 1];
            contour.bounds = union(contour.bounds, [x, y, x, y]);
          }
        } else {
          eligible = false;
        }
      } else if (operator === 'f' || operator === 'f*') {
        const scale = Math.hypot(...transform.slice(0, 4));
        const count = contours.reduce((total, contour) => total + contour.operations.length, 0);
        if (
          eligible &&
          solidFill &&
          markedDepth === 0 &&
          count >= 20 &&
          count <= 10_000 &&
          contours.length <= 512 &&
          scale > 0 &&
          scale <= 16
        ) {
          const fill: Fill = { start, end: token.end, operator, parts: parts(contours) };
          for (const part of fill.parts) {
            const normalized = part.contours.flatMap((contour) =>
              contour.operations.map(({ operator: kind, values }) => ({
                operator: kind,
                values: values.map((value, offset) => Number((value - part.bounds[offset % 2]).toFixed(6))),
              }))
            );
            const key = operator + normalized.map((operation) => operation.operator).join('');
            const candidates = groups.get(key) ?? [];
            const tolerance = Math.min(0.0002, 0.00008 / scale);
            let shape = candidates.find((candidate) =>
              normalized.every((operation, position) =>
                operation.values.every(
                  (value, offset) => Math.abs(value - candidate.operations[position].values[offset]) <= tolerance
                )
              )
            );
            if (!shape) {
              shape = {
                operations: normalized,
                operator,
                bounds: [0, 0, part.bounds[2] - part.bounds[0], part.bounds[3] - part.bounds[1]],
                uses: [],
              };
              candidates.push(shape);
              groups.set(key, candidates);
            }
            shape.uses.push(part);
            part.shape = shape;
          }
          fills.push(fill);
        }
        contours = [];
        eligible = true;
      } else if (['S', 's', 'B', 'B*', 'b', 'b*', 'n'].includes(operator)) {
        contours = [];
        eligible = true;
      } else if (contours.length || ['re', 'v', 'y', 'W', 'W*'].includes(operator)) {
        eligible = false;
      }
      operands.length = 0;
    }
  }
  let count = 0;
  const references = new Map<Shape, { key: PDFName; ref: PDFRef }>();
  for (const shapes of groups.values()) {
    for (const shape of shapes) {
      if (shape.uses.length < 3) {
        continue;
      }
      const stream = PDFRawStream.of(
        document.context.obj({
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [-0.001, -0.001, shape.bounds[2] + 0.001, shape.bounds[3] + 0.001],
          Resources: {},
        }),
        await deflate(binaryBytes(serialize(shape.operations) + `\n${shape.operator}`))
      );
      stream.dict.set(name('Filter'), name('FlateDecode'));
      references.set(shape, { key: name(`SharedPath${count++}`), ref: document.context.register(stream) });
    }
  }
  for (const page of pages) {
    let raw = page.raw;
    const node = document.getPage(page.index).node;
    const resources = (node.Resources() ?? document.context.obj({})).clone(document.context);
    const objects = (resources.lookupMaybe(name('XObject'), PDFDict) ?? document.context.obj({})).clone(
      document.context
    );
    let changed = false;
    for (const fill of page.fills.reverse()) {
      if (!fill.parts.some((part) => part.shape && references.has(part.shape))) {
        continue;
      }
      const chunks: string[] = [];
      for (const part of fill.parts) {
        const reference = part.shape && references.get(part.shape);
        if (reference) {
          let key = reference.key;
          while (objects.has(key) && objects.get(key) !== reference.ref) {
            key = name(key.decodeText() + 'x');
          }
          objects.set(key, reference.ref);
          chunks.push(`q\n1 0 0 1 ${PDFNumber.of(part.bounds[0])} ${PDFNumber.of(part.bounds[1])} cm\n${key} Do\nQ`);
        } else {
          chunks.push(serialize(part.contours.flatMap((contour) => contour.operations)) + `\n${fill.operator}`);
        }
      }
      raw = raw.slice(0, fill.start) + chunks.join('\n') + raw.slice(fill.end);
      changed = true;
    }
    if (changed) {
      resources.set(name('XObject'), objects);
      node.set(name('Resources'), resources);
      const stream = PDFRawStream.of(document.context.obj({ Filter: 'FlateDecode' }), await deflate(binaryBytes(raw)));
      node.set(name('Contents'), document.context.register(stream));
    }
  }
  return count;
}
