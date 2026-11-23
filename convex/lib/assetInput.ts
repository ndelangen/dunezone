import { ConvexError } from 'convex/values';

import { ASSET_TYPES, isRetiredAssetType } from '../../src/shared/assets/types';

/**
 * An asset's display name, decided once: the stored name when it holds one, "Untitled" when it does not.
 * `data` is `v.any()`, so the read is defensive rather than typed;
 * two files had spelled this identically, which is one file too many for a fallback that must never disagree with itself.
 */
export function assetDisplayName(row: { data: unknown }): string {
  const data = row.data as { name?: unknown } | null | undefined;
  return typeof data?.name === 'string' && data.name.trim() ? data.name : 'Untitled';
}

export function assertKnownAssetType(type: string): void {
  if (!Object.hasOwn(ASSET_TYPES, type)) {
    throw new Error(`Unknown asset type ${type}`);
  }
}

/** Refuses a new asset of a retired type (#3013); stored ones still read. */
export function assertCreatableAssetType(type: string): void {
  assertKnownAssetType(type);
  if (isRetiredAssetType(type)) {
    throw new ConvexError(`${ASSET_TYPES[type as keyof typeof ASSET_TYPES].label} are retired.`);
  }
}
