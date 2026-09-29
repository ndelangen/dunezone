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
      const assetId =
        assetType === 'cardback-preset'
          ? 'traitor'
          : assetType === 'faction-leader' || assetType === 'faction-troop' || assetType === 'faction-traitor'
            ? `${factionId}.10000000-1000-4000-8000-100000000001`
            : factionId;
      const path = publishedPath(assetType, assetId);
      expect(path).toBe(`/published/${publishedR2Key(assetType, assetId)}`);
      expect(matchPublishedPath(path)).toEqual({ assetType, assetId });
    }
  });

  test('a troop publishes its front under its identity and its authored back beside it, and nothing looser', () => {
    const troopId = '20000000-2000-4000-8000-200000000002';
    expect(publishedPath('faction-troop', `${factionId}.${troopId}`)).toBe(
      `/published/faction-troops/${factionId}.${troopId}/troop.jpg`
    );
    expect(matchPublishedPath(`/published/faction-troops/${factionId}.${troopId}.back/troop.jpg`)).toEqual({
      assetType: 'faction-troop',
      assetId: `${factionId}.${troopId}.back`,
    });
    for (const assetId of [
      factionId,
      `${factionId}.${troopId}.front`,
      `${factionId}.not-a-troop`,
      `${factionId}.${troopId}.back.back`,
    ]) {
      expect(matchPublishedPath(`/published/faction-troops/${assetId}/troop.jpg`)).toBeNull();
    }
  });

  test('a traitor front publishes under its leader identity, and the alliance front under the bare faction id', () => {
    const memberId = '10000000-1000-4000-8000-100000000001';
    expect(publishedPath('faction-traitor', `${factionId}.${memberId}`)).toBe(
      `/published/traitor-cards/${factionId}.${memberId}/card.jpg`
    );
    expect(publishedPath('faction-alliance', factionId)).toBe(`/published/alliance-cards/${factionId}/card.jpg`);
    for (const path of [
      `/published/traitor-cards/${factionId}/card.jpg`,
      `/published/traitor-cards/${factionId}.${memberId}.back/card.jpg`,
      `/published/alliance-cards/${factionId}.back/card.jpg`,
      `/published/alliance-cards/${factionId}.${memberId}/card.jpg`,
    ]) {
      expect(matchPublishedPath(path)).toBeNull();
    }
  });

  test('the faction sheet keeps the URL it published under before the table existed', () => {
    expect(publishedPath('faction_sheet', factionId)).toBe(`/published/factions/${factionId}/sheet.pdf`);
    expect(publishedR2Key('faction_sheet', factionId)).toBe(`factions/${factionId}/sheet.pdf`);
    expect(publishedHref('faction_sheet', factionId, 'v1.token')).toBe(
      `/published/factions/${factionId}/sheet.pdf?v=v1.token`
    );
  });

  test('public links allow bare paths and encode an optional unsigned cache buster', () => {
    const path = `/published/factions/${factionId}/sheet.pdf`;
    expect(publishedHref('faction_sheet', factionId)).toBe(path);
    expect(publishedHref('faction_sheet', factionId, '123')).toBe(`${path}?v=123`);
    expect(publishedHref('faction_sheet', factionId, '')).toBe(`${path}?v=`);
    expect(publishedHref('faction_sheet', factionId, 'a&b#c')).toBe(`${path}?v=a%26b%23c`);
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
    expect(matchPublishedPath(`/published/leaders/${factionId}/leader.jpg`)).toBeNull();
    expect(matchPublishedPath(`/published/leaders/${factionId}.not-a-member/leader.jpg`)).toBeNull();
    expect(
      matchPublishedPath(`/published/leaders/${factionId}.10000000-1000-4000-8000-100000000001.back/leader.jpg`)
    ).toBeNull();
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
