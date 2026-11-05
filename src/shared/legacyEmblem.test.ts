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
import { hasLegacyEmblems, readLegacyEmblemPath, renameLegacyEmblems } from './legacyEmblem';

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

  test('stay out of the artwork enums, which take the new names only; the stored roots rename first', () => {
    expect(EMBLEM.safeParse('/vector/logo/atreides.svg').success).toBe(false);
    expect(ALL.safeParse('/vector/logo/atreides.svg').success).toBe(false);
    expect(EMBLEM.options).toContain('/vector/emblem/atreides.svg');
  });

  test('read the `logo` key as `emblem`, which wins when a value has both', () => {
    expect(renameLegacyEmblems({ logo: 'a', name: 'n' })).toEqual({ emblem: 'a', name: 'n' });
    expect(renameLegacyEmblems({ logo: 'a', emblem: 'b' })).toEqual({ emblem: 'b' });
    expect(renameLegacyEmblems(['logo'])).toEqual(['logo']);
  });

  test('are rewritten at any depth, and nothing else is', () => {
    const stored = {
      showDuneLogo: true,
      about: 'See /vector/logo/ in the history.',
      token: { logo: '/vector/logo/ecaz.svg', decals: [{ id: '/vector/logo/fremen.svg' }] },
    };
    expect(hasLegacyEmblems(stored)).toBe(true);
    const renamed = renameLegacyEmblems(stored);
    expect(renamed).toEqual({
      showDuneLogo: true,
      about: 'See /vector/logo/ in the history.',
      token: { emblem: '/vector/emblem/ecaz.svg', decals: [{ id: '/vector/emblem/fremen.svg' }] },
    });
    expect(hasLegacyEmblems(renamed)).toBe(false);
  });
});

describe('decoders of stored data', () => {
  test('read a faction from a frozen publication job made before the rename as the renamed faction', () => {
    expect(HistoricalFactionPublicationSchema.parse(legacyFaction).emblem).toBe('/vector/emblem/atreides.svg');
  });

  test('refuse the old names from app saves, imports and Convex rows', () => {
    expect(CanonicalFactionStoredObject.safeParse(legacyFaction).success).toBe(false);
    expect(FactionWriteSchema.safeParse(legacyFaction).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse(assetPublishingFaction).success).toBe(true);
  });

  test('read a game capture from Durable Object storage taken before the rename', () => {
    const { factionLeader, ...captured } = legacyFaction;
    const capture = heroKeyedDecoder(HeroKeyedHistoricalFactionObject).parse({ ...captured, hero: factionLeader });
    expect(capture.emblem).toBe('/vector/emblem/atreides.svg');
    expect(capture).not.toHaveProperty('logo');
  });

  test('read a capture job queued before the rename as the payload it stands for', () => {
    const background = assetPublishingFaction.background;
    expect(parsePublicationAssetData('faction-token', { logo: '/vector/logo/atreides.svg', background })).toEqual(
      parsePublicationAssetData('faction-token', { emblem: '/vector/emblem/atreides.svg', background })
    );
  });
});
