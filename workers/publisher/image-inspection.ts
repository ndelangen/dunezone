/**
 * Header-only readers for the two image formats the capture path handles.
 *
 * Both exist so the pipeline can assert what it produced instead of trusting it.
 * Nothing here decodes pixels: the PNG reader stops after IHDR and the JPEG reader stops at the first start-of-frame, which is all that is needed to know the size and whether the scan structure is progressive.
 */

export class ImageInspectionError extends Error {}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageDimensions = { widthPx: number; heightPx: number };

/** Width and height straight out of IHDR, which the PNG spec requires to be the first chunk. */
export function pngDimensions(bytes: Uint8Array): ImageDimensions {
  if (bytes.byteLength < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new ImageInspectionError('Captured image is not a PNG');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') {
    throw new ImageInspectionError('PNG does not open with IHDR');
  }
  return { widthPx: view.getUint32(16), heightPx: view.getUint32(20) };
}

/**
 * Markers that carry no length field, so the scan steps past them by one byte rather than by a segment.
 * `FF01` is TEM and `FFD0`–`FFD7` are restart markers.
 */
function isStandaloneMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/**
 * Start-of-frame markers.
 * `FFC4`, `FFC8` and `FFCC` sit inside the same range but are Huffman tables, a JPEG extension, and arithmetic-coding conditioning, so they are segments rather than frames.
 */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export type JpegProfile = ImageDimensions & {
  /**
   * True for `FFC2`, the progressive start-of-frame.
   * This is the whole external contract in one bit: a published card has to render in passes, and the encoder is the only thing that decides whether it does.
   */
  progressive: boolean;
  /** The raw start-of-frame marker, so a failure can say which one it actually got. */
  startOfFrame: string;
};

export function jpegProfile(bytes: Uint8Array): JpegProfile {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new ImageInspectionError('Encoded image is not a JPEG');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (isStandaloneMarker(marker)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 3 >= bytes.byteLength) {
      break;
    }
    const length = view.getUint16(offset + 2);
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.byteLength) {
        break;
      }
      return {
        progressive: marker === 0xc2,
        startOfFrame: `FF${marker.toString(16).toUpperCase().padStart(2, '0')}`,
        heightPx: view.getUint16(offset + 5),
        widthPx: view.getUint16(offset + 7),
      };
    }
    if (length < 2) {
      break;
    }
    offset += 2 + length;
  }
  throw new ImageInspectionError('JPEG has no start-of-frame marker');
}
