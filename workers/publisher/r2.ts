import type { ClaimedTarget } from './convex';

export const PUBLISHER_CACHE_TOKEN_METADATA_KEY = 'publisherCacheToken';

export class ConditionalWriteConflictError extends Error {}
export class StoredObjectMetadataError extends Error {}

export type AssetBucket = {
  head(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: Uint8Array,
    options: R2PutOptions & { onlyIf: R2Conditional | Headers }
  ): Promise<R2Object | null>;
};

export function factionSheetKey(factionId: string): string {
  if (!factionId || factionId.includes('/') || factionId.includes('..')) {
    throw new Error('Faction id is invalid for the stable R2 key');
  }
  return `factions/${factionId}/sheet.pdf`;
}

function storedGeneration(object: R2Object): number | undefined {
  const value = object.customMetadata?.generation;
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new StoredObjectMetadataError('Stored generation metadata is invalid');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new StoredObjectMetadataError('Stored generation metadata is invalid');
  }
  return parsed;
}

export async function conditionallyPutFactionSheet(
  bucket: AssetBucket,
  claim: ClaimedTarget,
  payloadHash: string,
  cacheToken: string,
  bytes: Uint8Array
): Promise<{ key: string; etag: string }> {
  if (!/^[0-9a-f]{64}$/.test(payloadHash)) throw new Error('Payload hash is invalid');
  if (!/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(cacheToken)) {
    throw new Error('Publisher cache token is invalid');
  }
  const key = factionSheetKey(claim.factionId);
  const existing = await bucket.head(key);
  const generation = existing ? storedGeneration(existing) : undefined;
  if (generation !== undefined && generation > claim.generation) {
    throw new ConditionalWriteConflictError('Stored object has a newer diagnostic generation');
  }
  if (
    generation === claim.generation &&
    existing?.customMetadata?.payloadHash !== undefined &&
    existing.customMetadata.payloadHash !== payloadHash
  ) {
    throw new ConditionalWriteConflictError(
      'Stored object has different bytes for the same diagnostic generation'
    );
  }
  const onlyIf = existing ? { etagMatches: existing.etag } : new Headers({ 'If-None-Match': '*' });
  const written = await bucket.put(key, bytes, {
    onlyIf,
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: {
      factionId: claim.factionId,
      assetType: claim.assetType,
      generation: String(claim.generation),
      rendererVersion: claim.rendererVersion,
      payloadHash,
      [PUBLISHER_CACHE_TOKEN_METADATA_KEY]: cacheToken,
    },
  });
  if (!written) {
    throw new ConditionalWriteConflictError('Stable object changed after HEAD');
  }
  return { key, etag: written.etag };
}
