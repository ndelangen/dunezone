import { describe, expect, test, vi } from 'vitest';

import { rulebookEditionArtifactKey } from '../../src/shared/rulebooks/editionArtifacts';
import { handlePublicAssetRequest } from './delivery';
import { handleRulebookHtmlRequest } from './rulebook-html-delivery';
import { fakeR2Object } from './test-helpers';

const RULEBOOK_ID = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';
const KEY = rulebookEditionArtifactKey(RULEBOOK_ID, 4, 'html');
const HTML = '<!doctype html><title>Rulebook</title>';

function objectBody(etag = 'etag-four'): R2ObjectBody {
  return {
    ...fakeR2Object({ key: KEY, etag, size: HTML.length, uploaded: new Date('2026-09-01T12:00:00Z') }),
    body: new Response(HTML).body!,
    bodyUsed: false,
    arrayBuffer: async () => new TextEncoder().encode(HTML).buffer.slice(0) as ArrayBuffer,
    bytes: async () => new TextEncoder().encode(HTML),
    blob: async () => new Blob([HTML]),
    json: async () => JSON.parse(HTML),
    text: async () => HTML,
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
      resolveRulebookHtmlDelivery: vi.fn(async () =>
        status === 'found'
          ? { ok: true as const, status: 'found' as const, editionNumber: 4, key: KEY }
          : { ok: true as const, status: 'missing' as const }
      ),
    },
    publicBaseUrl: 'https://dune.zone',
  };
}

describe('Rulebook HTML delivery', () => {
  test('is dispatched before the existing published-asset matcher rejects the path', async () => {
    const current = dependencies();
    const response = await handlePublicAssetRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html`, { method: 'HEAD' }),
      { ASSET_BUCKET: current.bucket, ASSET_PUBLISHER_CACHE_TOKEN_SECRET: '' } as unknown as Env,
      { waitUntil: vi.fn() },
      { publicBaseUrl: current.publicBaseUrl, rulebookHtmlClient: current.client }
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Location')).toContain('/editions/4/rulebook.html');
  });

  test('serves permanent Edition bytes with immutable caching and noindex', async () => {
    const current = dependencies();
    const response = await handleRulebookHtmlRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/editions/4/rulebook.html`),
      { kind: 'edition', rulebookId: RULEBOOK_ID, editionNumber: 4 },
      current
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(HTML);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response.headers.get('Content-Location')).toContain('/editions/4/rulebook.html');
    expect(response.headers.get('Link')).toBe(
      `<https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html>; rel="canonical"`
    );
    expect(current.bucket.get).toHaveBeenCalledWith(KEY, { onlyIf: { etagMatches: 'etag-four' } });
  });

  test('revalidates the stable latest-ready path without marking it noindex', async () => {
    const current = dependencies();
    const response = await handleRulebookHtmlRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html`, {
        method: 'HEAD',
      }),
      { kind: 'latest', rulebookId: RULEBOOK_ID },
      current
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
    expect(response.headers.get('Content-Location')).toContain('/editions/4/rulebook.html');
    expect(current.bucket.get).not.toHaveBeenCalled();
  });

  test('returns 404 when the delivery seam gates a deleted Rulebook', async () => {
    const current = dependencies('missing');
    const response = await handleRulebookHtmlRequest(
      new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html`),
      { kind: 'latest', rulebookId: RULEBOOK_ID },
      current
    );

    expect(response.status).toBe(404);
    expect(current.bucket.head).not.toHaveBeenCalled();
  });

  test('does not serve a mismatched stable resolution or changed R2 object', async () => {
    const wrongKey = dependencies();
    wrongKey.client.resolveRulebookHtmlDelivery.mockResolvedValue({
      ok: true,
      status: 'found',
      editionNumber: 4,
      key: 'rulebooks/other/editions/4/rulebook.html',
    });
    await expect(
      handleRulebookHtmlRequest(
        new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html`),
        { kind: 'latest', rulebookId: RULEBOOK_ID },
        wrongKey
      )
    ).resolves.toMatchObject({ status: 503 });

    const changed = dependencies();
    changed.bucket.get.mockResolvedValue(objectBody('new-etag'));
    await expect(
      handleRulebookHtmlRequest(
        new Request(`https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html`),
        { kind: 'latest', rulebookId: RULEBOOK_ID },
        changed
      )
    ).resolves.toMatchObject({ status: 503 });
  });
});
