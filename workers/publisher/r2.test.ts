import { describe, expect, test, vi } from 'vitest';

import { publishedR2Key } from '../../src/shared/asset-publishing/publicationTargets';
import type { AssignedPublicationJob } from './convex';
import { PUBLISHER_CACHE_TOKEN_METADATA_KEY, putPublishedAsset } from './r2';
import type { AssetBucket } from './r2';
import { fakeR2Object } from './test-helpers';

const job: AssignedPublicationJob = {
  jobId: 'job-one',
  assetId: 'faction',
  assetType: 'faction_sheet',
  expiresAt: Date.now() + 240_000,
};
const payloadHash = 'a'.repeat(64);
const cacheToken = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;

describe('stable Publication object writes', () => {
  test('replaces the one stable object and stores current diagnostic metadata', async () => {
    const put = vi.fn(async () =>
      fakeR2Object({
        key: publishedR2Key(job.assetType, job.assetId),
        etag: 'new-etag',
        size: 3,
        uploaded: new Date(),
      })
    );
    const bucket: AssetBucket = { put };

    await expect(putPublishedAsset(bucket, job, payloadHash, cacheToken, new Uint8Array([1, 2, 3]))).resolves.toEqual({
      key: 'factions/faction/sheet.pdf',
      etag: 'new-etag',
    });
    expect(put).toHaveBeenCalledWith('factions/faction/sheet.pdf', expect.any(Uint8Array), {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: {
        assetId: 'faction',
        assetType: 'faction_sheet',
        payloadHash,
        [PUBLISHER_CACHE_TOKEN_METADATA_KEY]: cacheToken,
      },
    });
  });

  test('does not read, version, or conditionally fence the stable object', async () => {
    const put = vi.fn(async (_key: string, _value: Uint8Array, _options: R2PutOptions) => null);
    await expect(putPublishedAsset({ put }, job, payloadHash, cacheToken, new Uint8Array([1]))).rejects.toThrow(
      /not written/
    );
    const options = put.mock.calls[0]?.[2];
    expect(options).not.toHaveProperty('onlyIf');
  });

  test('rejects invalid stable keys and output metadata', async () => {
    expect(() => publishedR2Key('faction_sheet', '../faction')).toThrow();
    const bucket: AssetBucket = { put: vi.fn() };
    await expect(putPublishedAsset(bucket, job, 'not-a-hash', cacheToken, new Uint8Array([1]))).rejects.toThrow(
      /Payload hash/
    );
  });
});
