import { DeckAsset, TokenAsset, TreacheryAsset } from '../../src/shared/assets/schema';
import { ASSET_TYPES } from '../../src/shared/assets/types';

/**
 * Per-type write validation: every asset save passes its `data` through the same Zod the renderer draws from, so nothing unrenderable is ever stored.
 * Types gain a branch here as their editors land;
 * a type without a branch cannot be written at all.
 */
export function parseAssetDataForWrite(type: string, data: unknown): { data: unknown; name: string } {
  switch (type) {
    case 'card-treachery': {
      const parsed = TreacheryAsset.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'deck': {
      const parsed = DeckAsset.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The three shapes share one schema: shape is the Asset type, never a field, so only the clip differs downstream. */
    case 'token-round':
    case 'token-gear':
    case 'token-square': {
      const parsed = TokenAsset.parse(data);
      return { data: parsed, name: parsed.name };
    }
    default:
      throw new Error(`Asset type ${type} cannot be written yet`);
  }
}

export function assertKnownAssetType(type: string): void {
  if (!(type in ASSET_TYPES)) {
    throw new Error(`Unknown asset type ${type}`);
  }
}
