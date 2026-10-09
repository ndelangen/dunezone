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

export type StoredR2Entry = { bytes: Uint8Array; options: R2PutOptions };

function storedR2Object(key: string, entry: StoredR2Entry): R2Object {
  const base = fakeR2Object({
    key,
    etag: `etag-${key.slice(-12)}`,
    size: entry.bytes.byteLength,
    uploaded: new Date('2026-10-09T12:00:00.000Z'),
    customMetadata: entry.options.customMetadata as Record<string, string>,
  });
  return {
    ...base,
    writeHttpMetadata: base.writeHttpMetadata,
    httpMetadata: entry.options.httpMetadata as R2HTTPMetadata,
  };
}

/** An in-memory bucket that honours `onlyIf: { etagDoesNotMatch: '*' }`, as the media write paths use it. */
export function memoryR2Bucket(): Pick<R2Bucket, 'get' | 'head' | 'put'> & {
  objects: Map<string, StoredR2Entry>;
  puts: number;
} {
  const objects = new Map<string, StoredR2Entry>();
  const bucket = {
    objects,
    puts: 0,
    async head(key: string) {
      const entry = objects.get(key);
      return entry ? storedR2Object(key, entry) : null;
    },
    async get(key: string) {
      const entry = objects.get(key);
      if (!entry) {
        return null;
      }
      return { ...storedR2Object(key, entry), body: new Response(entry.bytes).body! } as unknown as R2ObjectBody;
    },
    async put(key: string, value: unknown, options: R2PutOptions = {}) {
      bucket.puts += 1;
      const onlyIf = options.onlyIf as R2Conditional | undefined;
      if (onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) {
        return null;
      }
      const entry = { bytes: value as Uint8Array, options };
      objects.set(key, entry);
      return storedR2Object(key, entry);
    },
  };
  return bucket as unknown as ReturnType<typeof memoryR2Bucket>;
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
