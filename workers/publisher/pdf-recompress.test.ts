import { deflateSync } from 'node:zlib';

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import { downsampleRgb, RECOMPRESS_RGB_SCALE, recompressCapturedPdf } from './pdf-recompress';

function noisyPixels(count: number): Uint8Array {
  // Deterministic pseudo-noise: incompressible enough to behave like grain.
  const bytes = new Uint8Array(count);
  let state = 0x12_34_56_78;
  for (let index = 0; index < count; index += 1) {
    // xorshift32 (Math.imul keeps 32-bit semantics): incompressible like grain.
    state ^= state << 13;
    state ^= state >>> 17;
    state = Math.imul(state ^ (state << 5), 1);
    bytes[index] = state & 0xff;
  }
  return bytes;
}

async function syntheticCapture(): Promise<{
  bytes: Uint8Array;
  refs: { rgb: string; gray: string; small: string; masked: string };
}> {
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  const context = document.context;

  function imageStream(width: number, height: number, channels: number, extra?: [string, unknown]) {
    const raw = noisyPixels(width * height * channels);
    const streamDict = context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      BitsPerComponent: 8,
      ColorSpace: channels === 3 ? 'DeviceRGB' : 'DeviceGray',
      Filter: 'FlateDecode',
    });
    if (extra) {
      streamDict.set(PDFName.of(extra[0]), context.obj(extra[1] as never));
    }
    const stream = PDFRawStream.of(streamDict, new Uint8Array(deflateSync(raw)));
    return context.register(stream);
  }

  const rgb = imageStream(400, 400, 3);
  const gray = imageStream(429, 426, 1);
  const small = imageStream(200, 431, 3);
  const masked = imageStream(400, 400, 3, ['SMask', rgb]);

  return {
    bytes: await document.save({ useObjectStreams: false }),
    refs: {
      rgb: rgb.toString(),
      gray: gray.toString(),
      small: small.toString(),
      masked: masked.toString(),
    },
  };
}

describe('recompressCapturedPdf', () => {
  test('downsamples only big standalone RGB rasters, losslessly, keeping FlateDecode', async () => {
    const { bytes } = await syntheticCapture();
    const result = await recompressCapturedPdf(bytes);

    expect(result.swappedImages).toBe(1);
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore);

    const reloaded = await PDFDocument.load(result.bytes);
    const images: Array<{ w: number; h: number; filter: string; channels: number }> = [];
    for (const [, object] of reloaded.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) {
        continue;
      }
      if (object.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) {
        continue;
      }
      images.push({
        w: Number(object.dict.get(PDFName.of('Width'))?.toString()),
        h: Number(object.dict.get(PDFName.of('Height'))?.toString()),
        filter: object.dict.get(PDFName.of('Filter'))?.toString() ?? '',
        channels: object.dict.get(PDFName.of('ColorSpace'))?.toString() === '/DeviceGray' ? 1 : 3,
      });
    }
    // Every image is still FlateDecode — JPEG is banned from the pipeline.
    expect(images.every((image) => image.filter === '/FlateDecode')).toBe(true);
    // The 400x400 RGB was downsampled to 0.35x; gray, small, and masked kept their dimensions.
    const expected = Math.round(400 * RECOMPRESS_RGB_SCALE);
    expect(images.filter((image) => image.w === expected && image.h === expected)).toHaveLength(1);
    expect(images.filter((image) => image.w === 429 && image.channels === 1)).toHaveLength(1);
    expect(images.filter((image) => image.w === 200)).toHaveLength(1);
  });

  test('returns input bytes untouched when nothing qualifies', async () => {
    const document = await PDFDocument.create();
    document.addPage([595, 842]);
    const bytes = await document.save({ useObjectStreams: false });
    const result = await recompressCapturedPdf(bytes);
    expect(result.swappedImages).toBe(0);
    expect(result.bytes).toBe(bytes);
  });
});

describe('downsampleRgb', () => {
  test('preserves flat color exactly and hits the requested dimensions', () => {
    const flat = new Uint8Array(100 * 100 * 3).fill(137);
    const result = downsampleRgb(flat, 100, 100, 0.35);
    expect(result.width).toBe(35);
    expect(result.height).toBe(35);
    expect(result.pixels.every((value) => value === 137)).toBe(true);
  });
});
