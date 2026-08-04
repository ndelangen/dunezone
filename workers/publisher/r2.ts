import type { AssignedPublicationJob } from './convex';

export const PUBLISHER_CACHE_TOKEN_METADATA_KEY = 'publisherCacheToken';

export type AssetBucket = {
  put(key: string, value: Uint8Array, options: R2PutOptions): Promise<R2Object | null>;
};

export function factionSheetKey(factionId: string): string {
  if (!factionId || factionId.includes('/') || factionId.includes('..')) {
    throw new Error('Faction id is invalid for the stable R2 key');
  }
  return `factions/${factionId}/sheet.pdf`;
}

export async function putPublishedAsset(
  bucket: AssetBucket,
  job: AssignedPublicationJob,
  payloadHash: string,
  cacheToken: string,
  bytes: Uint8Array
): Promise<{ key: string; etag: string }> {
  if (job.assetType !== 'faction_sheet') {
    throw new Error(`Unsupported Publication asset type: ${job.assetType}`);
  }
  if (!/^[0-9a-f]{64}$/.test(payloadHash)) {
    throw new Error('Payload hash is invalid');
  }
  if (!/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(cacheToken)) {
    throw new Error('Publisher cache token is invalid');
  }
  const key = factionSheetKey(job.assetId);
  const written = await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
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
