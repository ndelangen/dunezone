import { describe, expect, test } from 'vitest';

import { factionAssetPublishingCopy } from './assetPublishingStatus';

describe('faction save and publishing feedback', () => {
  test('moves from saving to immediate save confirmation', () => {
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

  test('explains active capture work without hiding the current PDF', () => {
    expect(factionAssetPublishingCopy('current', 'idle', 'scheduled')).toBe(
      'A new faction sheet capture is scheduled. The current PDF remains available.'
    );
    expect(factionAssetPublishingCopy('current', 'idle', 'in_progress')).toBe(
      'A new faction sheet capture is in progress. The current PDF remains available.'
    );
    expect(factionAssetPublishingCopy(null, 'idle', 'scheduled')).toBe(
      'A new faction sheet capture is scheduled.'
    );
    expect(factionAssetPublishingCopy('current', 'saved', 'scheduled')).toBe(
      'Saved. A new faction sheet capture is scheduled. The current PDF remains available.'
    );
  });
});
