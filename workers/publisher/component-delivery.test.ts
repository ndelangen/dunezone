import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vitest';

import {
  componentEnvelopeKey,
  componentPublicationEnvelopeSchema,
  factionMemberPublicationId,
} from '../../src/shared/asset-publishing/componentPublication';
import type { ComponentDeliveryResolution } from '../../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../../src/shared/asset-publishing/publicationTargets';
import { handleComponentRequest } from './component-delivery';
import { putComponentEnvelope, readComponentEnvelope } from './component-r2';
import { fakeR2Object } from './test-helpers';

const factionId = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';
const assetId = factionMemberPublicationId(factionId, '10000000-1000-4000-8000-100000000001');
const revisionA = '10000000-1000-4000-8000-100000000002';
const revisionB = '10000000-1000-4000-8000-100000000003';
const geometry = {
  width: 600,
  height: 600,
  parts: [{ key: 'name' as const, x: 0.1, y: 0.7, width: 0.8, height: 0.2 }],
};
const job = { jobId: 'capture-one', assetType: 'faction-leader' as const, assetId, expiresAt: 1 };

function storage() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    put: vi.fn(async (key: string, bytes: Uint8Array) => {
      if (objects.has(key)) {
        return null;
      }
      objects.set(key, bytes);
      return fakeR2Object({ key, etag: key, size: bytes.length, uploaded: new Date(0) });
    }),
    head: vi.fn(async () => null),
    get: vi.fn(async (key: string) => {
      const bytes = objects.get(key);
      if (!bytes) {
        return null;
      }
      return {
        ...fakeR2Object({ key, etag: key, size: bytes.length, uploaded: new Date(0) }),
        body: new Response(bytes).body!,
        bodyUsed: false,
        bytes: async () => bytes.slice(),
        writeHttpMetadata: () => {},
        arrayBuffer: async () => bytes.slice().buffer,
        text: async () => new TextDecoder().decode(bytes),
        json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
        blob: async () => new Blob([bytes]),
      };
    }),
  };
}

function client(resolution: ComponentDeliveryResolution) {
  return { resolveComponentDelivery: vi.fn(async () => resolution) };
}

function request(headers?: HeadersInit, cacheToken?: string) {
  return new Request(`https://dune.zone${publishedHref('faction-leader', assetId, cacheToken)}`, { headers });
}

describe('complete component delivery', () => {
  test('the same exported image URL retrieves replacement bytes and geometry from one new revision', async () => {
    const bucket = storage();
    const exportedHtml = `<img src="${publishedHref('faction-leader', assetId, revisionA)}">`;
    await putComponentEnvelope(bucket, job, 'a'.repeat(64), revisionA, new Uint8Array([1, 2, 3]), geometry);
    const first = await handleComponentRequest(request(), assetId, {
      bucket,
      client: client({ ok: true, status: 'found', revision: revisionA, publishedAt: 1000 }),
    });
    expect(first.status).toBe(200);
    expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([1, 2, 3]);
    const revisedGeometry = { ...geometry, parts: [{ ...geometry.parts[0], x: 0.2, width: 0.7 }] };
    await putComponentEnvelope(bucket, job, 'b'.repeat(64), revisionB, new Uint8Array([4, 5, 6]), revisedGeometry);
    const second = await handleComponentRequest(
      request({ 'If-None-Match': first.headers.get('ETag')! }, revisionA),
      assetId,
      {
        bucket,
        client: client({ ok: true, status: 'found', revision: revisionB, publishedAt: 2000 }),
      }
    );
    expect(second.status).toBe(200);
    expect([...new Uint8Array(await second.arrayBuffer())]).toEqual([4, 5, 6]);
    expect(exportedHtml).toContain(publishedHref('faction-leader', assetId, revisionA));
    expect((await readComponentEnvelope(bucket, assetId, revisionB))?.geometry).toEqual(revisedGeometry);
    expect((await readComponentEnvelope(bucket, assetId, revisionA))?.geometry).toEqual(geometry);
    expect(Buffer.from((await readComponentEnvelope(bucket, assetId, revisionA))!.image.base64, 'base64')).toEqual(
      Buffer.from([1, 2, 3])
    );
  });

  test('a live preview pins its geometry revision while removal still wins over the pinned bytes', async () => {
    const bucket = storage();
    const cardId = 'aaaaaaaaaaaaaaaa';
    const cardJob = { ...job, assetType: 'card-treachery' as const, assetId: cardId };
    await putComponentEnvelope(bucket, cardJob, 'a'.repeat(64), revisionA, new Uint8Array([1]), geometry);
    await putComponentEnvelope(bucket, cardJob, 'b'.repeat(64), revisionB, new Uint8Array([2]), geometry);
    const pinned = new Request(`https://dune.zone/published/cards/${cardId}/card.jpg?componentRevision=${revisionA}`);
    const response = await handleComponentRequest(
      pinned,
      cardId,
      { bucket, client: client({ ok: true, status: 'found', revision: revisionB, publishedAt: 2000 }) },
      'card-treachery'
    );
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1]);
    expect(response.headers.get('ETag')).toBe(`"${revisionA}"`);
    const removed = await handleComponentRequest(
      pinned,
      cardId,
      { bucket, client: client({ ok: true, status: 'missing' }) },
      'card-treachery'
    );
    expect(removed.status).toBe(404);
  });

  test('source removal wins over retained bytes and a matching conditional request', async () => {
    const bucket = storage();
    await putComponentEnvelope(bucket, job, 'a'.repeat(64), revisionA, new Uint8Array([1]), geometry);
    const response = await handleComponentRequest(request({ 'If-None-Match': `"${revisionA}"` }), assetId, {
      bucket,
      client: client({ ok: true, status: 'missing' }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(bucket.get).not.toHaveBeenCalled();
  });

  test('conditional delivery requires the current immutable envelope and keeps its revision', async () => {
    const bucket = storage();
    await putComponentEnvelope(bucket, job, 'a'.repeat(64), revisionA, new Uint8Array([1]), geometry);
    const response = await handleComponentRequest(request({ 'If-None-Match': `W/"${revisionA}"` }), assetId, {
      bucket,
      client: client({ ok: true, status: 'found', revision: revisionA, publishedAt: 1000 }),
    });
    expect(response.status).toBe(304);
    expect(response.headers.get('ETag')).toBe(`"${revisionA}"`);
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    bucket.objects.delete(componentEnvelopeKey(assetId, revisionA));
    expect(
      (
        await handleComponentRequest(request({ 'If-None-Match': `"${revisionA}"` }), assetId, {
          bucket,
          client: client({ ok: true, status: 'found', revision: revisionA, publishedAt: 1000 }),
        })
      ).status
    ).toBe(503);
  });

  test('a mismatched envelope cannot pair another component image with these named parts', async () => {
    const bucket = storage();
    await putComponentEnvelope(bucket, job, 'a'.repeat(64), revisionA, new Uint8Array([1]), geometry);
    const key = componentEnvelopeKey(assetId, revisionA);
    const envelope = componentPublicationEnvelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(bucket.objects.get(key)))
    );
    bucket.objects.set(key, new TextEncoder().encode(JSON.stringify({ ...envelope, revision: revisionB })));
    expect(
      (
        await handleComponentRequest(request(), assetId, {
          bucket,
          client: client({ ok: true, status: 'found', revision: revisionA, publishedAt: 1000 }),
        })
      ).status
    ).toBe(503);
  });

  test('an immutable component revision cannot be overwritten', async () => {
    const bucket = storage();
    await putComponentEnvelope(bucket, job, 'a'.repeat(64), revisionA, new Uint8Array([1]), geometry);
    await expect(
      putComponentEnvelope(bucket, job, 'b'.repeat(64), revisionA, new Uint8Array([2]), geometry)
    ).rejects.toThrow('not written');
    expect(bucket.put.mock.calls[0][0]).toBe(componentEnvelopeKey(assetId, revisionA));
  });
});
