import {
  BundleAssetInput,
  DeckAssetInput,
  RectangleTokenAssetInput,
  TokenAssetInput,
  TreacheryAssetInput,
} from './schema';

/**
 * Validates writable Asset data against the renderer-owned shape shared by the browser and server.
 */
export function parseAssetDataForWrite(type: string, data: unknown): { data: unknown; name: string } {
  switch (type) {
    case 'card-treachery': {
      const parsed = TreacheryAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    case 'deck': {
      const parsed = DeckAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* A container of tokens. It publishes nothing, so nothing downstream of this branch enqueues. */
    case 'bundle': {
      const parsed = BundleAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The three shapes share one schema: shape is the Asset type, never a field, so only the clip differs downstream. */
    case 'token-disc':
    case 'token-tech':
    case 'token-plate': {
      const parsed = TokenAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    /* The rectangle is a token by category and by backside rules, and its own schema by face: a free composition rather than a symbol in a fixed slot. */
    case 'token-enhance': {
      const parsed = RectangleTokenAssetInput.parse(data);
      return { data: parsed, name: parsed.name };
    }
    default:
      throw new Error(`Asset type ${type} cannot be written yet`);
  }
}
