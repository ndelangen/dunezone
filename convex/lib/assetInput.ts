import { ASSET_TYPES } from '../../src/shared/assets/types';

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
