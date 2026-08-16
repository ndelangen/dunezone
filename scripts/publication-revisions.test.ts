import { describe, expect, test } from 'vitest';

import { changedRendererAssetTypes } from './publication-revisions';

describe('Publication Renderer revision comparison', () => {
  test('treats equal maps as a no-op regardless of key order', () => {
    expect(
      changedRendererAssetTypes({ faction_token: 2, faction_sheet: 4 }, { faction_sheet: 4, faction_token: 2 })
    ).toEqual([]);
  });

  test('returns every asset type whose checked-in revision is higher', () => {
    expect(
      changedRendererAssetTypes({ faction_sheet: 4, faction_token: 2 }, { faction_sheet: 5, faction_token: 3 })
    ).toEqual(['faction_sheet', 'faction_token']);
  });

  test('rejects checked-in revisions behind stored production state', () => {
    expect(() => changedRendererAssetTypes({ faction_sheet: 5 }, { faction_sheet: 4 })).toThrow(/behind production/);
  });
});
