import {
  BundleAsset,
  DeckAsset,
  RectangleTokenAsset,
  TokenAsset,
  TreacheryAsset,
} from '../../src/shared/assets/schema';
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
    /* A container of tokens. It publishes nothing, so nothing downstream of this branch enqueues. */
    case 'bundle': {
      const parsed = BundleAsset.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The three shapes share one schema: shape is the Asset type, never a field, so only the clip differs downstream. */
    case 'token-disc':
    case 'token-tech':
    case 'token-plate': {
      const parsed = TokenAsset.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The rectangle is a token by category and by backside rules, and its own schema by face: a free composition rather than a symbol in a fixed slot. */
    case 'token-enhance': {
      const parsed = RectangleTokenAsset.parse(data);
      return { data: parsed, name: parsed.name };
    }
    default:
      throw new Error(`Asset type ${type} cannot be written yet`);
  }
}

export function assertKnownAssetType(type: string): void {
  if (!Object.hasOwn(ASSET_TYPES, type)) {
    throw new Error(`Unknown asset type ${type}`);
  }
}
