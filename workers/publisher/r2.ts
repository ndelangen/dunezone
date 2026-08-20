import {
  isPublicationAssetType,
  PUBLICATION_TARGETS,
  publishedR2Key,
} from '../../src/shared/asset-publishing/publicationTargets';
import type { AssignedPublicationJob } from './convex';

export const PUBLISHER_CACHE_TOKEN_METADATA_KEY = 'publisherCacheToken';

export type AssetBucket = {
  put(key: string, value: Uint8Array, options: R2PutOptions): Promise<R2Object | null>;
};

export async function putPublishedAsset(
  bucket: AssetBucket,
  job: AssignedPublicationJob,
  payloadHash: string,
  cacheToken: string,
  bytes: Uint8Array
): Promise<{ key: string; etag: string }> {
  if (!isPublicationAssetType(job.assetType)) {
    throw new Error(`Unsupported Publication asset type: ${job.assetType}`);
  }
  if (!/^[0-9a-f]{64}$/.test(payloadHash)) {
    throw new Error('Payload hash is invalid');
  }
  if (!/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(cacheToken)) {
    throw new Error('Publisher cache token is invalid');
  }
  const key = publishedR2Key(job.assetType, job.assetId);
  const written = await bucket.put(key, bytes, {
    httpMetadata: { contentType: PUBLICATION_TARGETS[job.assetType].contentType },
    customMetadata: {
      assetId: job.assetId,
      assetType: job.assetType,
      payloadHash,
      [PUBLISHER_CACHE_TOKEN_METADATA_KEY]: cacheToken,
    },
  });
  if (!written) {
    throw new Error('Published asset was not written');
  }
  return { key, etag: written.etag };
}
