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

  test('reads a failed replacement capture as the publication it leaves in place', () => {
    expect(factionAssetPublishingCopy('current', 'error')).toBe('Public assets are current.');
  });

  test('tells a viewer who can edit the faction that the replacement capture failed', () => {
    expect(factionAssetPublishingCopy('current', 'error', { viewerCanEdit: true })).toBe(
      'The previous faction sheet is still published, but the latest changes were not captured.'
    );
    expect(factionAssetPublishingCopy(null, 'error', { viewerCanEdit: true })).toBe(
      'The latest changes were not captured, so no faction sheet is published yet.'
    );
    expect(factionAssetPublishingCopy('current', null, { viewerCanEdit: true })).toBe('Public assets are current.');
  });
});
