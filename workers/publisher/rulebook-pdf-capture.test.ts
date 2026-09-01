import { describe, expect, test } from 'vitest';

import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import {
  hasRulebookPdfCapture,
  readRulebookPdfCaptureBatch,
  removeRulebookPdfCapture,
  stageRulebookPdfCapture,
} from './rulebook-pdf-capture';
import type { RulebookPdfCaptureBucket } from './rulebook-pdf-capture';
import { fakeR2Object } from './test-helpers';

function memoryBucket(): RulebookPdfCaptureBucket {
  const objects = new Map<string, { bytes: Uint8Array; metadata: R2Object }>();
  return {
    async put(key, value, options) {
      if (objects.has(key)) {
        return null;
      }
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
      const metadata = fakeR2Object({
        key,
        etag: 'capture-etag',
        size: bytes.byteLength,
        uploaded: new Date(),
        customMetadata: options?.customMetadata,
      });
      objects.set(key, { bytes, metadata });
      return metadata;
    },
    async head(key) {
      return objects.get(key)?.metadata ?? null;
    },
    async get(key) {
      const current = objects.get(key);
      if (!current) {
        return null;
      }
      return {
        ...current.metadata,
        body: new Response(current.bytes).body!,
        bodyUsed: false,
        arrayBuffer: async () => current.bytes.buffer.slice(0) as ArrayBuffer,
        bytes: async () => current.bytes,
        blob: async () => new Blob([current.bytes]),
        json: async () => JSON.parse(new TextDecoder().decode(current.bytes)),
        text: async () => new TextDecoder().decode(current.bytes),
      } as unknown as R2ObjectBody;
    },
    async delete(key) {
      for (const current of Array.isArray(key) ? key : [key]) {
        objects.delete(current);
      }
    },
  } as RulebookPdfCaptureBucket;
}

describe('private Rulebook PDF capture staging', () => {
  test('serves only the exact staged batch until expiry or cleanup', async () => {
    const bucket = memoryBucket();
    const now = Date.parse('2026-09-01T12:00:00Z');
    const document = createRulebookRenderDocumentFixture();
    const staged = await stageRulebookPdfCapture(
      bucket,
      {
        artifactId: 'artifact-one',
        editionId: 'edition-one',
        rulebookId: 'rulebook-one',
        editionNumber: 1,
        editionCreatedAt: '2026-09-01T12:00:00.000Z',
        rulebookName: 'Rulebook',
        document,
      },
      now
    );

    expect(staged.token).toMatch(/^[0-9a-f]{64}$/);
    await expect(hasRulebookPdfCapture(bucket, staged.token, now)).resolves.toBe(true);
    await expect(readRulebookPdfCaptureBatch(bucket, staged.token, 0, now)).resolves.toEqual(staged.bundle.batches[0]);
    await expect(readRulebookPdfCaptureBatch(bucket, staged.token, 1, now)).resolves.toBeNull();
    await expect(hasRulebookPdfCapture(bucket, staged.token, staged.bundle.expiresAt + 1)).resolves.toBe(false);

    await removeRulebookPdfCapture(bucket, staged.token);
    await expect(hasRulebookPdfCapture(bucket, staged.token, now)).resolves.toBe(false);
  });
});
