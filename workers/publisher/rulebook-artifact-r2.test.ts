import { describe, expect, test, vi } from 'vitest';

import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { putImmutableRulebookArtifact } from './rulebook-artifact-r2';
import type { RulebookArtifactBucket } from './rulebook-artifact-r2';
import { RulebookHtmlGenerationError } from './rulebook-html';
import { RulebookPdfGenerationError } from './rulebook-pdf';
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

const formats = [
  {
    kind: 'html',
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    rendererMetadata: {},
    foreignMetadata: { artifactId: 'other' },
    GenerationError: RulebookHtmlGenerationError,
  },
  {
    kind: 'pdf',
    httpMetadata: { contentDisposition: 'attachment; filename="rulebook.pdf"', contentType: 'application/pdf' },
    rendererMetadata: { rendererIdentity: 'renderer-one' },
    foreignMetadata: { rendererIdentity: 'renderer-two' },
    GenerationError: RulebookPdfGenerationError,
  },
] as const;

async function expectedMetadata(kind: string, rendererMetadata: Record<string, string>, bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    artifactId: job.artifactId,
    editionId: job.editionId,
    rulebookId: job.rulebookId,
    editionNumber: '2',
    kind,
    ...rendererMetadata,
    contentLength: String(bytes.byteLength),
    contentSha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
  };
}

describe('permanent Rulebook artifact storage', () => {
  test.each(formats)('reserves the permanent $kind key with a conditional write', async (format) => {
    const bytes = new Uint8Array([1, 2, 3]);
    const bucket = {
      put: vi.fn(async () => fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date() })),
      head: vi.fn(),
    };
    const key = `rulebooks/${job.rulebookId}/editions/2/rulebook.${format.kind}`;

    await expect(putImmutableRulebookArtifact(bucket, format.kind, job, bytes, 'renderer-one')).resolves.toEqual({
      key,
      created: true,
    });
    expect(bucket.put).toHaveBeenCalledWith(key, bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: format.httpMetadata,
      customMetadata: await expectedMetadata(format.kind, format.rendererMetadata, bytes),
    });
    expect(bucket.head).not.toHaveBeenCalled();
  });

  test.each(formats)(
    'reuses a $kind object only when its identity matches, and refuses with the executor error class otherwise',
    async (format) => {
      const bytes = new Uint8Array([1]);
      const existing = fakeR2Object({
        etag: 'etag-one',
        size: 1,
        uploaded: new Date(),
        customMetadata: await expectedMetadata(format.kind, format.rendererMetadata, bytes),
      });
      const bucket = {
        put: vi.fn(async () => null),
        head: vi.fn(async () => existing),
      } as unknown as RulebookArtifactBucket;
      await expect(
        putImmutableRulebookArtifact(bucket, format.kind, job, bytes, 'renderer-one')
      ).resolves.toMatchObject({ created: false });

      vi.mocked(bucket.head).mockResolvedValue(
        fakeR2Object({
          etag: 'etag-two',
          size: 1,
          uploaded: new Date(),
          customMetadata: {
            ...(await expectedMetadata(format.kind, format.rendererMetadata, bytes)),
            ...format.foreignMetadata,
          },
        })
      );
      const refusal = putImmutableRulebookArtifact(bucket, format.kind, job, bytes, 'renderer-one');
      await expect(refusal).rejects.toBeInstanceOf(format.GenerationError);
      await expect(refusal).rejects.toThrow('occupied by different bytes');
    }
  );
});
