import { describe, expect, test, vi } from 'vitest';

import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { putImmutableRulebookHtml } from './rulebook-html-r2';
import type { RulebookHtmlBucket } from './rulebook-html-r2';
import { fakeR2Object } from './test-helpers';

const job = {
  artifactId: 'artifact-one',
  editionId: 'edition-one',
  rulebookId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
  editionNumber: 2,
  rulebookName: 'Arrakis field manual',
  document: createRulebookRenderDocumentFixture(),
};

describe('permanent Rulebook HTML storage', () => {
  test('creates bytes only when the permanent key is absent', async () => {
    const object = fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date() });
    const bucket = { put: vi.fn(async () => object), head: vi.fn() };

    await expect(putImmutableRulebookHtml(bucket, job, new Uint8Array([1, 2, 3]))).resolves.toEqual({
      key: `rulebooks/${job.rulebookId}/editions/2/rulebook.html`,
      created: true,
    });
    expect(bucket.put).toHaveBeenCalledWith(
      `rulebooks/${job.rulebookId}/editions/2/rulebook.html`,
      expect.any(Uint8Array),
      expect.objectContaining({ onlyIf: { etagDoesNotMatch: '*' } })
    );
    expect(bucket.head).not.toHaveBeenCalled();
  });

  test('reuses only an object owned by the same artifact identity', async () => {
    const source = new Uint8Array([1]);
    const digest = await crypto.subtle.digest('SHA-256', source);
    const contentSha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const existing = fakeR2Object({
      etag: 'etag-one',
      size: 3,
      uploaded: new Date(),
      customMetadata: {
        artifactId: job.artifactId,
        editionId: job.editionId,
        rulebookId: job.rulebookId,
        editionNumber: '2',
        kind: 'html',
        contentLength: '1',
        contentSha256,
      },
    });
    const bucket = { put: vi.fn(async () => null), head: vi.fn(async () => existing) } as unknown as RulebookHtmlBucket;
    await expect(putImmutableRulebookHtml(bucket, job, source)).resolves.toMatchObject({
      created: false,
    });

    vi.mocked(bucket.head).mockResolvedValue(
      fakeR2Object({ etag: 'etag-two', size: 1, uploaded: new Date(), customMetadata: { artifactId: 'other' } })
    );
    await expect(putImmutableRulebookHtml(bucket, job, new Uint8Array([2]))).rejects.toThrow(
      'occupied by different bytes'
    );
  });
});
