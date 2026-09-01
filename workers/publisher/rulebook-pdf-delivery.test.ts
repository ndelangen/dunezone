import { describe, expect, test, vi } from 'vitest';

import { rulebookEditionArtifactKey } from '../../src/shared/rulebooks/editionArtifacts';
import { handlePublicAssetRequest } from './delivery';
import { handleRulebookPdfRequest } from './rulebook-pdf-delivery';
import { fakeR2Object } from './test-helpers';

const RULEBOOK_ID = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';
const KEY = rulebookEditionArtifactKey(RULEBOOK_ID, 4, 'pdf');
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function objectBody(etag = 'etag-four'): R2ObjectBody {
  return {
    ...fakeR2Object({ key: KEY, etag, size: PDF.byteLength, uploaded: new Date('2026-09-01T12:00:00Z') }),
    body: new Response(PDF).body!,
    bodyUsed: false,
    arrayBuffer: async () => PDF.buffer.slice(0) as ArrayBuffer,
    bytes: async () => PDF,
    blob: async () => new Blob([PDF]),
    json: async () => JSON.parse(new TextDecoder().decode(PDF)),
    text: async () => new TextDecoder().decode(PDF),
  } as unknown as R2ObjectBody;
}

function dependencies(status: 'found' | 'missing' = 'found') {
  const metadata = objectBody();
  return {
    bucket: {
      head: vi.fn(async () => metadata),
      get: vi.fn(async () => objectBody()),
    },
    client: {
      resolveRulebookPdfDelivery: vi.fn(async () =>
        status === 'found'
          ? { ok: true as const, status: 'found' as const, editionNumber: 4, key: KEY }
          : { ok: true as const, status: 'missing' as const }
      ),
    },
  };
}

describe('Rulebook PDF delivery', () => {
  test('is dispatched before the existing published-asset matcher rejects the path', async () => {
    const current = dependencies();
    const response = await handlePublicAssetRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.pdf`, {
        method: 'HEAD',
      }),
      { ASSET_BUCKET: current.bucket, ASSET_PUBLISHER_CACHE_TOKEN_SECRET: '' } as unknown as Env,
      { waitUntil: vi.fn() },
      { rulebookPdfClient: current.client }
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('application/pdf');
  });

  test('serves immutable Edition bytes with download and noindex headers', async () => {
    const current = dependencies();
    const response = await handleRulebookPdfRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.pdf`),
      { rulebookId: RULEBOOK_ID, editionNumber: 4 },
      current
    );

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="rulebook.pdf"');
    expect(response.headers.get('Content-Location')).toContain('/editions/4/rulebook.pdf');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(current.bucket.get).toHaveBeenCalledWith(KEY, { onlyIf: { etagMatches: 'etag-four' } });
  });

  test('returns 304 without loading bytes and gates a deleted Rulebook before R2', async () => {
    const current = dependencies();
    const notModified = await handleRulebookPdfRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.pdf`, {
        headers: { 'If-None-Match': '"etag-four"' },
      }),
      { rulebookId: RULEBOOK_ID, editionNumber: 4 },
      current
    );
    expect(notModified.status).toBe(304);
    expect(current.bucket.get).not.toHaveBeenCalled();

    const deleted = dependencies('missing');
    await expect(
      handleRulebookPdfRequest(
        new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.pdf`),
        { rulebookId: RULEBOOK_ID, editionNumber: 4 },
        deleted
      )
    ).resolves.toMatchObject({ status: 404 });
    expect(deleted.bucket.head).not.toHaveBeenCalled();
  });

  test('does not serve a changed object or a mismatched resolution', async () => {
    const changed = dependencies();
    changed.bucket.get.mockResolvedValue(objectBody('etag-five'));
    await expect(
      handleRulebookPdfRequest(
        new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.pdf`),
        { rulebookId: RULEBOOK_ID, editionNumber: 4 },
        changed
      )
    ).resolves.toMatchObject({ status: 503 });

    const mismatched = dependencies();
    mismatched.client.resolveRulebookPdfDelivery.mockResolvedValue({
      ok: true,
      status: 'found',
      editionNumber: 5,
      key: KEY,
    });
    await expect(
      handleRulebookPdfRequest(
        new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.pdf`),
        { rulebookId: RULEBOOK_ID, editionNumber: 4 },
        mismatched
      )
    ).resolves.toMatchObject({ status: 503 });
  });
});
