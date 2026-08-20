import { describe, expect, test } from 'vitest';

import {
  matchPublishedPath,
  PUBLICATION_ASSET_TYPES,
  publishedHref,
  publishedPath,
  publishedR2Key,
} from './publicationTargets';

const factionId = 'k1'.repeat(12);

describe('publication targets', () => {
  test('the public path and the R2 key stay two views of one location', () => {
    for (const assetType of PUBLICATION_ASSET_TYPES) {
      const path = publishedPath(assetType, factionId);
      expect(path).toBe(`/published/${publishedR2Key(assetType, factionId)}`);
      expect(matchPublishedPath(path)).toEqual({ assetType, assetId: factionId });
    }
  });

  test('the faction sheet keeps the URL it published under before the table existed', () => {
    expect(publishedPath('faction_sheet', factionId)).toBe(`/published/factions/${factionId}/sheet.pdf`);
    expect(publishedR2Key('faction_sheet', factionId)).toBe(`factions/${factionId}/sheet.pdf`);
    expect(publishedHref('faction_sheet', factionId, 'v1.token')).toBe(
      `/published/factions/${factionId}/sheet.pdf?v=v1.token`
    );
  });

  test('near misses under /published are not artifacts', () => {
    expect(matchPublishedPath('/published/factions/short/sheet.pdf')).toBeNull();
    expect(matchPublishedPath(`/published/factions/${factionId}/sheet.png`)).toBeNull();
    expect(matchPublishedPath(`/published/cards/${factionId}/sheet.pdf`)).toBeNull();
    /* An id position may not carry a path of its own, or the key escapes its prefix. */
    expect(matchPublishedPath(`/published/factions/nested/${factionId}/sheet.pdf`)).toBeNull();
  });

  test('a key that would escape its prefix is refused', () => {
    expect(() => publishedR2Key('faction_sheet', '../elsewhere')).toThrow(/invalid/i);
    expect(() => publishedR2Key('faction_sheet', '')).toThrow(/invalid/i);
  });
});
