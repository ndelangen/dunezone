import { describe, expect, test } from 'vite-plus/test';

import { parsePublicationAssetData } from './asset-publishing/publication';
import { ALL, EMBLEM } from './assetIds';
import { assetPublishingFaction } from './factions/fixtures/assetPublishingFaction';
import {
  FactionWriteSchema,
  HeroKeyedHistoricalFactionObject,
  heroKeyedDecoder,
  HistoricalFactionPublicationSchema,
  CanonicalFactionStoredObject,
} from './factions/schema';
import { readLegacyEmblemPath } from './legacyEmblem';

/** The faction as it was stored before the rename: the `logo` key and the old folder. */
const { emblem: _emblem, ...rest } = assetPublishingFaction;
const legacyFaction = { ...rest, logo: '/vector/logo/atreides.svg' };

describe('the old names', () => {
  test('read a stock path from before the rename as the renamed one, and leave anything else alone', () => {
    expect(readLegacyEmblemPath('/vector/logo/atreides.svg')).toBe('/vector/emblem/atreides.svg');
    expect(readLegacyEmblemPath('/vector/generic/axes.svg')).toBe('/vector/generic/axes.svg');
    expect(readLegacyEmblemPath('/web/logo.svg')).toBe('/web/logo.svg');
    expect(readLegacyEmblemPath(7)).toBe(7);
  });

  test('stay out of the artwork enums, which take the new names only', () => {
    expect(EMBLEM.safeParse('/vector/logo/atreides.svg').success).toBe(false);
    expect(ALL.safeParse('/vector/logo/atreides.svg').success).toBe(false);
    expect(EMBLEM.options).toContain('/vector/emblem/atreides.svg');
  });
});

describe('every decoder refuses the old names', () => {
  test('app saves, imports and Convex rows', () => {
    expect(CanonicalFactionStoredObject.safeParse(legacyFaction).success).toBe(false);
    expect(FactionWriteSchema.safeParse(legacyFaction).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse(assetPublishingFaction).success).toBe(true);
  });

  test('sheet jobs and game captures, which keep the `hero` literal', () => {
    expect(HistoricalFactionPublicationSchema.safeParse(legacyFaction).success).toBe(false);
    expect(HistoricalFactionPublicationSchema.safeParse(assetPublishingFaction).success).toBe(true);
    const { factionLeader, ...captured } = legacyFaction;
    const capture = heroKeyedDecoder(HeroKeyedHistoricalFactionObject);
    expect(capture.safeParse({ ...captured, hero: factionLeader }).success).toBe(false);
    const { factionLeader: leader, ...current } = assetPublishingFaction;
    expect(capture.safeParse({ ...current, hero: leader }).success).toBe(true);
  });

  test('capture jobs', () => {
    const background = assetPublishingFaction.background;
    expect(() =>
      parsePublicationAssetData('faction-token', { logo: '/vector/logo/atreides.svg', background })
    ).toThrow();
    expect(parsePublicationAssetData('faction-token', { emblem: '/vector/emblem/atreides.svg', background })).toEqual({
      emblem: '/vector/emblem/atreides.svg',
      background,
    });
  });
});
