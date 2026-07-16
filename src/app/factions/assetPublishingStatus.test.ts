import { describe, expect, test } from 'vitest';

import { factionAssetPublishingCopy } from './assetPublishingStatus';

describe('faction save and publishing feedback', () => {
  test('moves from saving to immediate save confirmation and automatic publishing states', () => {
    expect(factionAssetPublishingCopy('current', 'saving')).toBe('Saving changes…');
    expect(factionAssetPublishingCopy('waiting', 'saved')).toBe(
      'Saved immediately. Assets are waiting to publish automatically.'
    );
    expect(factionAssetPublishingCopy('publishing', 'saved')).toBe(
      'Saved immediately. Assets are publishing automatically.'
    );
    expect(factionAssetPublishingCopy('delayed', 'saved')).toBe(
      'Saved immediately. Asset publishing is delayed and will retry automatically.'
    );
    expect(factionAssetPublishingCopy('current', 'saved')).toBe(
      'Saved immediately. Public assets are current.'
    );
  });

  test('keeps absent and failed-save semantics explicit', () => {
    expect(factionAssetPublishingCopy(null)).toBe('Public asset publishing is not available yet.');
    expect(factionAssetPublishingCopy('waiting', 'error')).toBe('Changes were not saved.');
  });
});
