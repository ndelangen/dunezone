import { describe, expect, test } from 'vitest';

import { factionAssetPublishingCopy } from './assetPublishingStatus';

describe('faction publishing feedback', () => {
  test('states a publication, or its absence', () => {
    expect(factionAssetPublishingCopy('current')).toBe('Public assets are current.');
    expect(factionAssetPublishingCopy(null)).toBe('The public asset will be available soon.');
  });

  test('explains active capture work without hiding the current PDF', () => {
    expect(factionAssetPublishingCopy('current', 'scheduled')).toBe(
      'A new faction sheet capture is scheduled. The current PDF remains available.'
    );
    expect(factionAssetPublishingCopy('current', 'in_progress')).toBe(
      'A new faction sheet capture is in progress. The current PDF remains available.'
    );
    expect(factionAssetPublishingCopy(null, 'scheduled')).toBe('A new faction sheet capture is scheduled.');
  });

  test('tells every viewer that a failed replacement capture may leave the sheet out of date', () => {
    expect(factionAssetPublishingCopy('current', 'error')).toBe(
      'The published faction sheet may be out of date because the latest changes were not captured.'
    );
    expect(factionAssetPublishingCopy(null, 'error')).toBe(
      'The latest changes were not captured, so no faction sheet is published yet.'
    );
  });
});
