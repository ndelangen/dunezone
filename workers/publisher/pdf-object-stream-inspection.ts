import { PDFArray, PDFContext, PDFName, PDFNumber, PDFObjectParser, PDFRawStream, PDFRef } from 'pdf-lib';
import type { PDFObject, PDFDict } from 'pdf-lib';
import ByteStream from 'pdf-lib/es/core/parser/ByteStream.js';

const name = PDFName.of;
const decoder = new TextDecoder('latin1');
const MAX_OBJECTS = 100_000;
const MAX_DECODED_OBJECT_BYTES = 8 * 1024 * 1024;
type Entry = { type: number; location: number; index: number };

function integer(dictionary: PDFDict, key: string, maximum = MAX_OBJECTS): number {
  const value = dictionary.get(name(key));
  const number = value instanceof PDFNumber ? value.asNumber() : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) {
    throw new Error(`Compressed PDF has an invalid ${key}`);
  }
  return number;
}

async function inflate(stream: PDFRawStream, maximum: number): Promise<Uint8Array> {
  if (stream.dict.get(name('Filter')) !== name('FlateDecode') || stream.dict.has(name('DecodeParms'))) {
    throw new Error('Compressed PDF object tables require plain FlateDecode');
  }
  const reader = new Blob([Uint8Array.from(stream.contents)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      length += value.length;
      if (length > maximum) {
        throw new Error('Compressed PDF object data exceeds its bound');
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function parseObject(bytes: Uint8Array, context: PDFContext): { object: PDFObject; end: number } {
  const cursor = ByteStream.of(bytes);
  const object = PDFObjectParser.forByteStream(cursor, context).parseObject();
  return { object, end: cursor.offset() };
}

function indirectObject(bytes: Uint8Array, offset: number, end: number, context: PDFContext) {
  const header = /^(\d+)\s+(\d+)\s+obj\s+/.exec(decoder.decode(bytes.subarray(offset, offset + 64)));
  if (!header) {
    throw new Error('Compressed xref does not point to an exact object header');
  }
  const body = bytes.subarray(offset + header[0].length, end);
  const parsed = parseObject(body, context);
  if (!/^\s*endobj\s*$/.test(decoder.decode(body.subarray(parsed.end)))) {
    throw new Error('Compressed PDF contains unindexed or incomplete object data');
  }
  if (
    parsed.object instanceof PDFRawStream &&
    integer(parsed.object.dict, 'Length', bytes.length) !== parsed.object.contents.length
  ) {
    throw new Error('Compressed PDF stream length does not match its bytes');
  }
  return { object: parsed.object, number: Number(header[1]), generation: Number(header[2]) };
}

/** Checks the exact offsets, complete object coverage, and object-stream member indices of our final serialization. */
export async function inspectCompressedObjects(bytes: Uint8Array, xrefOffset: number, startxrefOffset: number) {
  const context = PDFContext.create();
  const xref = indirectObject(bytes, xrefOffset, startxrefOffset, context);
  if (
    !(xref.object instanceof PDFRawStream) ||
    xref.object.dict.get(name('Type')) !== name('XRef') ||
    xref.generation !== 0
  ) {
    throw new Error('startxref does not point to a cross-reference stream');
  }
  const dictionary = xref.object.dict;
  if (['Prev', 'XRefStm', 'Encrypt'].some((key) => dictionary.has(name(key)))) {
    throw new Error('Compressed PDF must have one unencrypted cross-reference section');
  }
  const size = integer(dictionary, 'Size');
  const widths = dictionary.get(name('W'));
  const index = dictionary.get(name('Index'));
  if (
    !(widths instanceof PDFArray) ||
    widths.size() !== 3 ||
    (index &&
      (!(index instanceof PDFArray) ||
        index.size() !== 2 ||
        Number(index.get(0)) !== 0 ||
        Number(index.get(1)) !== size))
  ) {
    throw new Error('Compressed PDF cross-reference coverage is incomplete');
  }
  const fieldWidths = widths.asArray().map(Number);
  if (size < 2 || fieldWidths.some((width) => !Number.isInteger(width) || width < 1 || width > 4)) {
    throw new Error('Compressed PDF cross-reference field widths are invalid');
  }
  const rowWidth = fieldWidths.reduce((sum, width) => sum + width, 0);
  const table = await inflate(xref.object, MAX_OBJECTS * 12);
  if (table.length !== size * rowWidth) {
    throw new Error('Compressed PDF cross-reference length does not match Size');
  }
  const entries: Entry[] = [];
  let cursor = 0;
  for (let number = 0; number < size; number += 1) {
    const fields = fieldWidths.map((width) => {
      let value = 0;
      for (let index = 0; index < width; index += 1) {
        value = value * 256 + table[cursor++];
      }
      return value;
    });
    const [type, location, member] = fields;
    if (number === 0 ? type !== 0 || location !== 0 || member !== 65_535 : type !== 1 && type !== 2) {
      throw new Error('Compressed PDF has an invalid or missing cross-reference entry');
    }
    entries.push({ type, location, index: member });
  }
  const own = entries[xref.number];
  if (!own || own.type !== 1 || own.location !== xrefOffset || own.index !== 0) {
    throw new Error('Cross-reference stream does not index itself exactly');
  }
  const physical = entries
    .map((entry, number) => ({ ...entry, number }))
    .filter((entry) => entry.type === 1)
    .sort((a, b) => a.location - b.location);
  const expected = new Map<number, number>();
  const objectStreams = new Map<number, PDFRawStream>();
  const header = decoder.decode(bytes.subarray(0, physical[0].location));
  if (!/^%PDF-\d\.\d\s+%[^\r\n]*[\r\n]+\s*$/.test(header)) {
    throw new Error('Compressed PDF has unindexed data before its first object');
  }
  for (const [index, entry] of physical.entries()) {
    const end = physical[index + 1]?.location ?? startxrefOffset;
    if (entry.location <= 0 || entry.location >= end || end > startxrefOffset) {
      throw new Error('Compressed PDF object offsets overlap or exceed the file');
    }
    const parsed = indirectObject(bytes, entry.location, end, context);
    if (parsed.number !== entry.number || parsed.generation !== entry.index) {
      throw new Error('Compressed xref entry does not match its object header');
    }
    if (parsed.object instanceof PDFRawStream && parsed.object.dict.get(name('Type')) === name('ObjStm')) {
      if (entry.index !== 0) {
        throw new Error('Object streams require generation zero');
      }
      objectStreams.set(entry.number, parsed.object);
    } else if (entry.number !== xref.number) {
      expected.set(entry.number, entry.index);
    }
  }
  let decodedBytes = 0;
  for (const [number, stream] of objectStreams) {
    const data = await inflate(stream, MAX_DECODED_OBJECT_BYTES - decodedBytes);
    decodedBytes += data.length;
    const count = integer(stream.dict, 'N');
    const first = integer(stream.dict, 'First', data.length);
    const header = decoder.decode(data.subarray(0, first));
    if (count < 1 || !/^(?:\d+\s+\d+\s+)+$/.test(header)) {
      throw new Error('Object stream has an invalid member table');
    }
    const fields = header.trim().split(/\s+/).map(Number);
    if (fields.length !== count * 2) {
      throw new Error('Object stream member count does not match N');
    }
    for (let member = 0; member < count; member += 1) {
      const objectNumber = fields[member * 2];
      const offset = fields[member * 2 + 1];
      const end = member + 1 < count ? fields[member * 2 + 3] : data.length - first;
      const entry = entries[objectNumber];
      if (
        !Number.isSafeInteger(objectNumber) ||
        !entry ||
        entry.type !== 2 ||
        entry.location !== number ||
        entry.index !== member ||
        expected.has(objectNumber)
      ) {
        throw new Error('Object-stream member does not match its cross-reference entry');
      }
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (member === 0 && offset !== 0) ||
        offset >= end ||
        end > data.length - first
      ) {
        throw new Error('Object stream member offset is invalid');
      }
      const body = data.subarray(first + offset, first + end);
      const parsed = parseObject(body, context);
      if (parsed.object instanceof PDFRawStream || !/^\s*$/.test(decoder.decode(body.subarray(parsed.end)))) {
        throw new Error('Object-stream member boundaries do not match its parsed object');
      }
      expected.set(objectNumber, 0);
    }
  }
  for (const [number, entry] of entries.entries()) {
    if (entry.type === 2 && !expected.has(number)) {
      throw new Error('Compressed PDF has an unparsed object-stream member');
    }
  }
  const root = dictionary.get(name('Root'));
  if (!(root instanceof PDFRef) || expected.get(root.objectNumber) !== root.generationNumber) {
    throw new Error('Compressed PDF Root has no exact cross-reference entry');
  }
  return { expected, root, size };
}
