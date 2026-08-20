export function fakeR2Object(options: {
  key?: string;
  etag: string;
  size: number;
  uploaded: Date;
  customMetadata?: Record<string, string>;
}): R2Object {
  return {
    key: options.key ?? 'factions/faction/sheet.pdf',
    version: 'version',
    size: options.size,
    etag: options.etag,
    httpEtag: `"${options.etag}"`,
    checksums: { toJSON: () => ({}) },
    uploaded: options.uploaded,
    customMetadata: options.customMetadata,
    storageClass: 'Standard',
    writeHttpMetadata(_headers: Headers) {},
  } satisfies R2Object;
}

/** Just enough PNG for `pngDimensions`: the signature and an IHDR chunk carrying the size. */
export function pngBytes(widthPx: number, heightPx: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, widthPx);
  view.setUint32(20, heightPx);
  return bytes;
}

/**
 * Just enough JPEG for `jpegProfile`: a start-of-frame segment, progressive (`FFC2`) or baseline (`FFC0`).
 * Nothing decodes these, so the component table is zeroed rather than plausible.
 */
export function jpegBytes(options: { widthPx: number; heightPx: number; progressive: boolean }): Uint8Array {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, options.progressive ? 0xc2 : 0xc0]);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 17);
  bytes[6] = 8;
  view.setUint16(7, options.heightPx);
  view.setUint16(9, options.widthPx);
  bytes[11] = 3;
  return bytes;
}
