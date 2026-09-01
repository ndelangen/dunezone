import { describe, expect, test } from 'vitest';

import {
  matchPublishedPath,
  PUBLICATION_ASSET_TYPES,
  PUBLICATION_TARGETS,
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

  test('the Rulebook first page uses an immutable Edition-specific location', () => {
    const editionId = '000000000010010rulebook_editions';
    expect(publishedPath('rulebook-first-page', editionId)).toBe(`/published/rulebooks/${editionId}/first-page.jpg`);
    expect(matchPublishedPath(`/published/rulebooks/${editionId}/first-page.jpg`)).toEqual({
      assetType: 'rulebook-first-page',
      assetId: editionId,
    });
  });

  test('near misses under /published are not artifacts', () => {
    expect(matchPublishedPath('/published/factions/short/sheet.pdf')).toBeNull();
    expect(matchPublishedPath(`/published/factions/${factionId}/sheet.png`)).toBeNull();
    expect(matchPublishedPath(`/published/cards/${factionId}/sheet.pdf`)).toBeNull();
    /* An id position may not carry a path of its own, or the key escapes its prefix. */
    expect(matchPublishedPath(`/published/factions/nested/${factionId}/sheet.pdf`)).toBeNull();
  });

  test('no two types share a location', () => {
    /* `matchPublishedPath` matches on collection and file alone, so a duplicate pair would resolve to whichever row came first. */
    const locations = PUBLICATION_ASSET_TYPES.map(
      (assetType) => `${PUBLICATION_TARGETS[assetType].collection}/${PUBLICATION_TARGETS[assetType].file}`
    );
    expect(new Set(locations).size).toBe(locations.length);
  });

  test('a key that would escape its prefix is refused', () => {
    expect(() => publishedR2Key('faction_sheet', '../elsewhere')).toThrow(/invalid/i);
    expect(() => publishedR2Key('faction_sheet', '')).toThrow(/invalid/i);
  });
});
