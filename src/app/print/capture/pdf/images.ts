import type { PDFDocument } from 'pdf-lib';
import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';

import { contentTokens, decodedContent, deflate, pageContent } from './content';
import { identity, matrix, multiply } from './geometry';
import type { Matrix } from './geometry';

const name = PDFName.of;
const MAX_IMAGE_PIXELS = 16_000_000;
const IMAGE_PPI = 150;
const IMAGE_QUALITY = 0.7;

/** Uses each image's largest printed occurrence, including images inside transparency groups. */
function imageResolutions(document: PDFDocument): Map<string, number> {
  const resolutions = new Map<string, number>();
  const cached = new Map<PDFRawStream, ReturnType<typeof contentTokens>>();
  let visits = 0;
  function form(stream: PDFRawStream, resources: PDFDict | undefined, transform: Matrix, depth: number) {
    if (depth > 20 || ++visits > 100_000) {
      throw new Error('PDF drawing traversal exceeds its bound');
    }
    const values = stream.dict.lookupMaybe(name('Matrix'), PDFArray)?.asArray().map(Number) ?? identity;
    let tokens = cached.get(stream);
    if (!tokens) {
      tokens = contentTokens(decodedContent(stream));
      cached.set(stream, tokens);
    }
    visit(
      tokens,
      stream.dict.lookupMaybe(name('Resources'), PDFDict) ?? resources,
      multiply(transform, matrix(values)),
      depth
    );
  }
  function visit(
    tokens: ReturnType<typeof contentTokens>,
    resources: PDFDict | undefined,
    initial: Matrix,
    depth: number
  ) {
    let transform = initial;
    const stack: Matrix[] = [];
    const operands: (string | number)[] = [];
    for (const { value } of tokens) {
      if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
        operands.push(Number(value));
        continue;
      }
      if (value.startsWith('/')) {
        operands.push(value);
        continue;
      }
      if (value === 'q') {
        stack.push(transform);
      } else if (value === 'Q') {
        const previous = stack.pop();
        if (!previous) {
          throw new Error('PDF has an unbalanced graphics state');
        }
        transform = previous;
      } else if (value === 'cm') {
        transform = multiply(transform, matrix(operands));
      } else if ((value === 'gs' || value === 'Do') && operands.length === 1 && typeof operands[0] === 'string') {
        const resourcesByName = resources?.lookupMaybe(name(value === 'Do' ? 'XObject' : 'ExtGState'), PDFDict);
        const ref = resourcesByName?.get(name(operands[0].slice(1)));
        const object = document.context.lookup(ref);
        if (value === 'gs' && object instanceof PDFDict) {
          const mask = document.context.lookup(object.get(name('SMask')));
          const group = mask instanceof PDFDict ? document.context.lookup(mask.get(name('G'))) : undefined;
          if (group instanceof PDFRawStream) {
            form(group, resources, transform, depth + 1);
          }
        } else if (object instanceof PDFRawStream) {
          if (object.dict.get(name('Subtype')) === name('Form')) {
            form(object, resources, transform, depth + 1);
          } else if (object.dict.get(name('Subtype')) === name('Image') && ref instanceof PDFRef) {
            const x = Math.hypot(transform[0], transform[1]);
            const y = Math.hypot(transform[2], transform[3]);
            if (x > 0 && y > 0) {
              const ppi = Math.min(
                (Number(object.dict.get(name('Width'))) * 72) / x,
                (Number(object.dict.get(name('Height'))) * 72) / y
              );
              resolutions.set(ref.toString(), Math.min(resolutions.get(ref.toString()) ?? ppi, ppi));
            }
          }
        }
      } else if (value === 'BI') {
        throw new Error('Inline PDF images cannot be optimized');
      }
      operands.length = 0;
    }
    if (stack.length) {
      throw new Error('PDF has an unclosed graphics state');
    }
  }
  for (const [index, page] of document.getPages().entries()) {
    visit(contentTokens(pageContent(document, index)), page.node.Resources(), identity, 0);
  }
  return resolutions;
}

function dimensions(stream: PDFRawStream) {
  return { width: Number(stream.dict.get(name('Width'))), height: Number(stream.dict.get(name('Height'))) };
}

function hasColorSpace(stream: PDFRawStream, color: string): boolean {
  const space = stream.dict.lookup(PDFName.of('ColorSpace'));
  if (space === name(color)) {
    return true;
  }
  if (
    color !== 'DeviceRGB' ||
    !(space instanceof PDFArray) ||
    space.size() !== 2 ||
    space.get(0) !== name('ICCBased') ||
    stream.dict.get(name('Filter')) !== name('FlateDecode')
  ) {
    return false;
  }
  const profile = space.lookup(1);
  return (
    profile instanceof PDFRawStream && Number(profile.dict.get(name('N'))) === 3 && !profile.dict.has(name('Range'))
  );
}

function eligibleImage(stream: PDFRawStream, color: string): boolean {
  const { width, height } = dimensions(stream);
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width * height <= MAX_IMAGE_PIXELS &&
    Number(stream.dict.get(name('BitsPerComponent'))) === 8 &&
    hasColorSpace(stream, color) &&
    ['DecodeParms', 'Decode', 'Matte', 'ImageMask', 'Mask'].every((key) => !stream.dict.has(name(key)))
  );
}

async function bitmap(stream: PDFRawStream, gray = false): Promise<ImageBitmap | undefined> {
  const { width, height } = dimensions(stream);
  const filter = stream.dict.get(name('Filter'));
  if (filter === name('DCTDecode') && !gray) {
    return await createImageBitmap(new Blob([Uint8Array.from(stream.contents)], { type: 'image/jpeg' }));
  }
  if (filter !== name('FlateDecode')) {
    return;
  }
  const pixels = decodePDFRawStream(stream).decode();
  const channels = gray ? 1 : 3;
  if (pixels.length !== width * height * channels) {
    return;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = pixels[index * channels];
    rgba[index * 4 + 1] = pixels[index * channels + (gray ? 0 : 1)];
    rgba[index * 4 + 2] = pixels[index * channels + (gray ? 0 : 2)];
    rgba[index * 4 + 3] = 255;
  }
  return await createImageBitmap(new ImageData(rgba, width, height));
}

function resizedDictionary(document: PDFDocument, stream: PDFRawStream, width: number, height: number, filter: string) {
  const dictionary = stream.dict.clone(document.context);
  dictionary.delete(name('Length'));
  dictionary.set(name('Width'), document.context.obj(width));
  dictionary.set(name('Height'), document.context.obj(height));
  dictionary.set(name('Filter'), name(filter));
  return dictionary;
}

/** Keeps vector content intact and reduces raster images according to their physical print size. */
export async function compressImages(document: PDFDocument): Promise<number> {
  const resolutions = imageResolutions(document);
  let changed = 0;
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    const ppi = resolutions.get(ref.toString());
    if (!(object instanceof PDFRawStream) || !ppi || !eligibleImage(object, 'DeviceRGB')) {
      continue;
    }
    const { width, height } = dimensions(object);
    const ratio = Math.min(1, IMAGE_PPI / ppi);
    const nextWidth = Math.max(1, Math.round(width * ratio));
    const nextHeight = Math.max(1, Math.round(height * ratio));
    const mask = document.context.lookup(object.dict.get(name('SMask')));
    if (
      mask &&
      (!(mask instanceof PDFRawStream) ||
        !eligibleImage(mask, 'DeviceGray') ||
        dimensions(mask).width !== width ||
        dimensions(mask).height !== height)
    ) {
      continue;
    }
    const source = await bitmap(object);
    if (!source) {
      continue;
    }
    const canvas = new OffscreenCanvas(nextWidth, nextHeight);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('PDF image compression has no canvas context');
    }
    try {
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, nextWidth, nextHeight);
    } finally {
      source.close();
    }
    const jpeg = new Uint8Array(
      await (await canvas.convertToBlob({ type: 'image/jpeg', quality: IMAGE_QUALITY })).arrayBuffer()
    );
    const rgba = context.getImageData(0, 0, nextWidth, nextHeight).data;
    const rgb = new Uint8Array(nextWidth * nextHeight * 3);
    for (let index = 0; index < nextWidth * nextHeight; index += 1) {
      rgb.set(rgba.subarray(index * 4, index * 4 + 3), index * 3);
    }
    const lossless = await deflate(rgb);
    const bytes = jpeg.length < lossless.length ? jpeg : lossless;
    if (bytes.length >= object.contents.length) {
      continue;
    }
    const dictionary = resizedDictionary(
      document,
      object,
      nextWidth,
      nextHeight,
      bytes === jpeg ? 'DCTDecode' : 'FlateDecode'
    );
    if (mask instanceof PDFRawStream && (nextWidth !== width || nextHeight !== height)) {
      const sourceMask = await bitmap(mask, true);
      if (!sourceMask) {
        continue;
      }
      try {
        context.drawImage(sourceMask, 0, 0, nextWidth, nextHeight);
      } finally {
        sourceMask.close();
      }
      const maskRgba = context.getImageData(0, 0, nextWidth, nextHeight).data;
      const gray = new Uint8Array(nextWidth * nextHeight);
      for (let index = 0; index < gray.length; index += 1) {
        gray[index] = maskRgba[index * 4];
      }
      const resizedMask = PDFRawStream.of(
        resizedDictionary(document, mask, nextWidth, nextHeight, 'FlateDecode'),
        await deflate(gray)
      );
      /* Each resized image owns its mask; another image may still use the original dimensions. */
      dictionary.set(name('SMask'), document.context.register(resizedMask));
    }
    document.context.assign(ref, PDFRawStream.of(dictionary, bytes));
    changed += 1;
  }
  return changed;
}
