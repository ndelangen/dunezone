import { describe, expect, test } from 'vitest';

import { factionAssetPublishingCopy } from './assetPublishingStatus';

describe('faction save and publishing feedback', () => {
  test('moves from saving to immediate save confirmation without exposing job state', () => {
    expect(factionAssetPublishingCopy('current', 'saving')).toBe('Saving changes…');
    expect(factionAssetPublishingCopy('current', 'saved')).toBe(
      'Saved. Publication scheduled. Public assets are current.'
    );
    expect(factionAssetPublishingCopy(null, 'saved')).toBe(
      'Saved. Publication scheduled. The public asset will be available soon.'
    );
  });

  test('keeps absent and failed-save semantics explicit', () => {
    expect(factionAssetPublishingCopy(null)).toBe('The public asset will be available soon.');
    expect(factionAssetPublishingCopy('current', 'error')).toBe('Changes were not saved.');
  });
});
