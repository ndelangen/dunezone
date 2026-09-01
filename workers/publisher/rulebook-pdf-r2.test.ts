import { describe, expect, test, vi } from 'vitest';

import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { putImmutableRulebookPdf } from './rulebook-pdf-r2';
import type { RulebookPdfBucket } from './rulebook-pdf-r2';
import { fakeR2Object } from './test-helpers';

const job = {
  artifactId: 'artifact-one',
  editionId: 'edition-one',
  rulebookId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
  editionNumber: 2,
  editionCreatedAt: '2026-09-01T12:00:00.000Z',
  rulebookName: 'Arrakis field manual',
  document: createRulebookRenderDocumentFixture(),
};

async function expectedMetadata(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    artifactId: job.artifactId,
    editionId: job.editionId,
    rulebookId: job.rulebookId,
    editionNumber: '2',
    kind: 'pdf',
    rendererIdentity: 'renderer-one',
    contentLength: String(bytes.byteLength),
    contentSha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
  };
}

describe('permanent Rulebook PDF storage', () => {
  test('reserves the permanent path with a conditional write and PDF metadata', async () => {
    const object = fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date() });
    const bucket = { put: vi.fn(async () => object), head: vi.fn() };

    await expect(putImmutableRulebookPdf(bucket, job, new Uint8Array([1, 2, 3]), 'renderer-one')).resolves.toEqual({
      key: `rulebooks/${job.rulebookId}/editions/2/rulebook.pdf`,
      created: true,
    });
    expect(bucket.put).toHaveBeenCalledWith(
      `rulebooks/${job.rulebookId}/editions/2/rulebook.pdf`,
      expect.any(Uint8Array),
      expect.objectContaining({
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: {
          contentDisposition: 'attachment; filename="rulebook.pdf"',
          contentType: 'application/pdf',
        },
      })
    );
  });

  test('reuses only byte-identical output from the same artifact and renderer', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const existing = fakeR2Object({
      etag: 'etag-one',
      size: bytes.byteLength,
      uploaded: new Date(),
      customMetadata: await expectedMetadata(bytes),
    });
    const bucket = {
      put: vi.fn(async () => null),
      head: vi.fn(async () => existing),
    } as unknown as RulebookPdfBucket;

    await expect(putImmutableRulebookPdf(bucket, job, bytes, 'renderer-one')).resolves.toMatchObject({
      created: false,
    });
    vi.mocked(bucket.head).mockResolvedValue(
      fakeR2Object({
        etag: 'etag-two',
        size: bytes.byteLength,
        uploaded: new Date(),
        customMetadata: { ...(await expectedMetadata(bytes)), rendererIdentity: 'renderer-two' },
      })
    );
    await expect(putImmutableRulebookPdf(bucket, job, bytes, 'renderer-one')).rejects.toThrow(
      'occupied by different bytes'
    );
  });
});
