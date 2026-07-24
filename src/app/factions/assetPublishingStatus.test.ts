import { describe, expect, test } from 'vitest';

import { factionAssetPublishingCopy } from './assetPublishingStatus';

describe('faction save and publishing feedback', () => {
  test('moves from saving to immediate save confirmation and automatic publishing states', () => {
    expect(factionAssetPublishingCopy('current', 'saving')).toBe('Saving changes…');
    expect(factionAssetPublishingCopy('waiting', 'saved')).toBe(
      'Saved. Publication scheduled. Assets are waiting to publish automatically.'
    );
    expect(factionAssetPublishingCopy('publishing', 'saved')).toBe(
      'Saved. Publication scheduled. Assets are publishing automatically.'
    );
    expect(factionAssetPublishingCopy('delayed', 'saved')).toBe(
      'Saved. Publication scheduled. Asset publishing is delayed and will retry automatically.'
    );
    expect(factionAssetPublishingCopy('current', 'saved')).toBe(
      'Saved. Publication scheduled. Public assets are current.'
    );
  });

  test('keeps absent and failed-save semantics explicit', () => {
    expect(factionAssetPublishingCopy(null)).toBe('Public asset publishing is not available yet.');
    expect(factionAssetPublishingCopy('waiting', 'error')).toBe('Changes were not saved.');
  });
});
