import { deflateSync, inflateSync } from 'node:zlib';

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

/**
 * In-place recompression of a captured faction-sheet PDF (wayfinder #257).
 *
 * Chromium embeds every image as a lossless FlateDecode raster (see the spike record on the map, #256).
 * The accepted policy shrinks only the big RGB portrait rasters by LOSSLESS downsampling — resize to 0.35×, re-deflate, still
 * FlateDecode.
 * JPEG is banned: at any quality it replaces this art style's grain with directional streaks.
 * Grayscale rasters (texture tiles), mask pairs, and small fragments are byte-untouched — tile grain is faction identity.
 *
 * Runtime-agnostic: pdf-lib + node:zlib (Workers via nodejs_compat, and Bun).
 */

export const RECOMPRESS_RGB_SCALE = 0.35;
/** Only square-ish art rasters; text/name masks are wide-short and stay lossless. */
const RECOMPRESS_MIN_DIMENSION_PX = 300;
/** Post-compression ceiling (#257): leader-heavy factions land well under this. */
export const RECOMPRESSED_PDF_MAX_BYTES = 4_000_000;

export type RecompressionResult = {
  bytes: Uint8Array;
  swappedImages: number;
  bytesBefore: number;
  bytesAfter: number;
};

/**
 * Area-averaging downsample of packed RGB rows — the correct filter for large reductions (every source pixel contributes to exactly the output pixel(s) its area overlaps, weighted by coverage).
 */
export function downsampleRgb(
  source: Uint8Array,
  width: number,
  height: number,
  scale: number
): { pixels: Uint8Array; width: number; height: number } {
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));
  const sums = new Float64Array(outWidth * outHeight * 3);
  const weights = new Float64Array(outWidth * outHeight);
  const xRatio = outWidth / width;
  const yRatio = outHeight / height;

  for (let y = 0; y < height; y += 1) {
    const outY = Math.min(outHeight - 1, Math.floor(y * yRatio));
    for (let x = 0; x < width; x += 1) {
      const outX = Math.min(outWidth - 1, Math.floor(x * xRatio));
      const from = (y * width + x) * 3;
      const to = (outY * outWidth + outX) * 3;
      sums[to] += source[from]!;
      sums[to + 1] += source[from + 1]!;
      sums[to + 2] += source[from + 2]!;
      weights[outY * outWidth + outX] += 1;
    }
  }

  const pixels = new Uint8Array(outWidth * outHeight * 3);
  for (let index = 0; index < outWidth * outHeight; index += 1) {
    const weight = weights[index]! || 1;
    pixels[index * 3] = Math.round(sums[index * 3]! / weight);
    pixels[index * 3 + 1] = Math.round(sums[index * 3 + 1]! / weight);
    pixels[index * 3 + 2] = Math.round(sums[index * 3 + 2]! / weight);
  }
  return { pixels, width: outWidth, height: outHeight };
}

export async function recompressCapturedPdf(input: Uint8Array): Promise<RecompressionResult> {
  const document = await PDFDocument.load(input);
  let swappedImages = 0;

  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) {
      continue;
    }
    const dict = object.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) {
      continue;
    }
    if (dict.get(PDFName.of('Filter'))?.toString() !== '/FlateDecode') {
      continue;
    }
    if (dict.has(PDFName.of('SMask'))) {
      continue;
    }
    const width = Number(dict.get(PDFName.of('Width'))?.toString());
    const height = Number(dict.get(PDFName.of('Height'))?.toString());
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < RECOMPRESS_MIN_DIMENSION_PX ||
      height < RECOMPRESS_MIN_DIMENSION_PX
    ) {
      continue;
    }

    let raw: Uint8Array | null;
    try {
      raw = new Uint8Array(inflateSync(object.contents));
    } catch {
      raw = null;
    }
    // RGB only (raw bytes exactly w*h*3): grayscale tiles stay byte-identical.
    if (!raw || raw.byteLength !== width * height * 3) {
      continue;
    }

    const resized = downsampleRgb(raw, width, height, RECOMPRESS_RGB_SCALE);
    const encoded = new Uint8Array(deflateSync(resized.pixels, { level: 9 }));
    if (encoded.byteLength >= object.contents.byteLength) {
      continue;
    }

    dict.set(PDFName.of('Width'), document.context.obj(resized.width));
    dict.set(PDFName.of('Height'), document.context.obj(resized.height));
    dict.delete(PDFName.of('DecodeParms'));
    dict.delete(PDFName.of('Length'));
    document.context.assign(ref, PDFRawStream.of(dict, encoded));
    swappedImages += 1;
  }

  const bytes = swappedImages > 0 ? await document.save({ useObjectStreams: false }) : input;
  return {
    bytes,
    swappedImages,
    bytesBefore: input.byteLength,
    bytesAfter: bytes.byteLength,
  };
}
