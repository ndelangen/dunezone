import { describe, expect, test } from 'vite-plus/test';

import { ASSET_TYPE_KEYS, ASSET_TYPES, assetTypeNoun } from './types';

describe('Asset type nouns', () => {
  test('every label is a plural the noun can drop its "s" from', () => {
    for (const type of ASSET_TYPE_KEYS) {
      expect(ASSET_TYPES[type].label).toMatch(/[^s]s$/);
      expect(assetTypeNoun(type) + 's').toBe(ASSET_TYPES[type].label);
    }
  });

  test('names one Asset', () => {
    expect(assetTypeNoun('card-treachery')).toBe('Treachery card');
    expect(assetTypeNoun('deck')).toBe('Deck');
  });
});
