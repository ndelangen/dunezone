import { describe, expect, test } from 'vitest';

import { ImageInspectionError, jpegProfile, pngDimensions } from './image-inspection';
import { pngBytes } from './test-helpers';

function segment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
}

function startOfFrame(marker: number, widthPx: number, heightPx: number): number[] {
  return segment(marker, [8, heightPx >> 8, heightPx & 0xff, widthPx >> 8, widthPx & 0xff, 1, 1, 0x11, 0]);
}

/**
 * A JPEG shaped like one an encoder actually emits: a JFIF header, a quantization table, and a Huffman table all sit ahead of the frame.
 * `FFC4` is the interesting one, since it lives inside the start-of-frame marker range without being a frame.
 */
function realisticJpeg(marker: number, widthPx: number, heightPx: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(
      0xdb,
      Array.from({ length: 65 }, () => 3)
    ),
    ...segment(
      0xc4,
      Array.from({ length: 20 }, () => 0)
    ),
    ...startOfFrame(marker, widthPx, heightPx),
    0xff,
    0xda,
  ]);
}

describe('image inspection', () => {
  test('finds a progressive start-of-frame past the segments that precede it', () => {
    expect(jpegProfile(realisticJpeg(0xc2, 900, 1263))).toEqual({
      progressive: true,
      startOfFrame: 'FFC2',
      widthPx: 900,
      heightPx: 1263,
    });
  });

  test('reports a baseline start-of-frame as not progressive', () => {
    expect(jpegProfile(realisticJpeg(0xc0, 500, 500))).toMatchObject({ progressive: false, startOfFrame: 'FFC0' });
  });

  test('reads PNG dimensions off IHDR', () => {
    expect(pngDimensions(pngBytes(900, 1263))).toEqual({ widthPx: 900, heightPx: 1263 });
  });

  test('refuses bytes that are not the format they are read as', () => {
    expect(() => pngDimensions(new Uint8Array(32))).toThrow(ImageInspectionError);
    expect(() => jpegProfile(pngBytes(10, 10))).toThrow(ImageInspectionError);
  });
});
