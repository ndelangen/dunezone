import { describe, expect, it } from 'vite-plus/test';

import { parsePublicationAssetData } from '../asset-publishing/publication';
import { assetPublishingFaction, legacyAssetPublishingFaction } from './fixtures/assetPublishingFaction';
import {
  Background,
  CanonicalFactionClientSchema,
  CanonicalFactionStoredObject,
  FactionInputSchema,
  FactionWriteSchema,
  HistoricalFactionPublicationSchema,
  toStoredHeroKey,
} from './schema';

describe('faction schema', () => {
  it('requires identities for live records while preserving old imports and frozen publications', () => {
    const legacy = structuredClone(legacyAssetPublishingFaction);
    const publication = { factionId: 'historical-faction', slug: 'historical-faction', faction: legacy };

    expect(CanonicalFactionStoredObject.safeParse(legacy).success).toBe(false);
    expect(CanonicalFactionClientSchema.safeParse(legacy).success).toBe(false);
    expect(FactionInputSchema.parse(legacy)).toEqual(legacy);
    expect(parsePublicationAssetData('faction_sheet', publication)).toEqual({
      ...publication,
      faction: toStoredHeroKey(legacy),
    });

    const live = structuredClone(assetPublishingFaction);
    expect(CanonicalFactionStoredObject.parse(live)).toEqual(live);
    expect(CanonicalFactionClientSchema.parse({ ...live, futureField: 'kept' })).toEqual({
      ...live,
      futureField: 'kept',
    });
    expect(FactionInputSchema.parse(live)).toEqual(live);
  });

  it('refuses the old `hero` key on stored and client reads, and reads it on saves and frozen publications', () => {
    const live = structuredClone(assetPublishingFaction);
    const stored = toStoredHeroKey(live);

    expect(CanonicalFactionStoredObject.safeParse(stored).success).toBe(false);
    expect(CanonicalFactionClientSchema.safeParse(stored).success).toBe(false);
    expect(FactionInputSchema.safeParse(stored).success).toBe(false);
    expect(FactionWriteSchema.parse(stored)).toEqual(FactionWriteSchema.parse(live));
    expect(HistoricalFactionPublicationSchema.parse(toStoredHeroKey(legacyAssetPublishingFaction))).toEqual(
      legacyAssetPublishingFaction
    );
  });

  it('rejects the retired legacy background shape', () => {
    const legacy = {
      ...structuredClone(assetPublishingFaction),
      background: {
        image: '/image/texture/021.jpg',
        colors: ['#4b4c0d', '#d9c979'],
        strength: 0.55,
        opacity: 1,
      },
    };

    expect(FactionInputSchema.safeParse(legacy).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse(legacy).success).toBe(false);
  });

  it('keeps canonical storage wider than current name semantics', () => {
    const historical = structuredClone(assetPublishingFaction);
    historical.name = '';

    expect(FactionInputSchema.safeParse(historical).success).toBe(false);
    expect(CanonicalFactionStoredObject.parse(historical).name).toBe('');
    historical.name = '家族';
    expect(FactionWriteSchema.safeParse(historical).success).toBe(false);
    expect(FactionInputSchema.parse(historical).name).toBe('家族');
    expect(CanonicalFactionStoredObject.parse(historical).name).toBe('家族');
    expect(HistoricalFactionPublicationSchema.parse(historical).name).toBe('家族');
  });

  it('reads retired TTS link lists in extras as absent while authoring accepts only catalogue references', () => {
    const legacyLinks = { name: 'TTS', items: [{ url: 'https://example.com/board.png' }] };
    const reference = { type: 'deck' as const, slug: 'omens' };
    const stored = { ...structuredClone(assetPublishingFaction), extras: [legacyLinks, reference] };

    expect(CanonicalFactionStoredObject.parse(stored).extras).toEqual([reference]);
    expect(FactionInputSchema.safeParse(stored).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse({ ...stored, extras: [{ type: 'deck' }] }).success).toBe(false);
  });

  it('narrows authored prose while keeping legacy stored prose readable', () => {
    const multilineSetup = structuredClone(assetPublishingFaction);
    multilineSetup.rules.startText = 'First line\nsecond line';
    const invalidBody = structuredClone(assetPublishingFaction);
    invalidBody.rules.advantages[0]!.text = '*unfinished';

    expect(FactionInputSchema.safeParse(multilineSetup).success).toBe(false);
    expect(FactionInputSchema.safeParse(invalidBody).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse(multilineSetup).success).toBe(true);
    expect(CanonicalFactionStoredObject.safeParse(invalidBody).success).toBe(true);
  });

  it('requires grouped complexity at authoring, storage, and client-read boundaries', () => {
    const { complexity: _complexity, ...withoutComplexity } = structuredClone(assetPublishingFaction);

    expect(FactionInputSchema.safeParse(withoutComplexity).success).toBe(false);
    expect(FactionInputSchema.safeParse({ ...withoutComplexity, complexity: 0.4 }).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse(withoutComplexity).success).toBe(false);
    expect(CanonicalFactionStoredObject.safeParse({ ...withoutComplexity, complexity: 0.4 }).success).toBe(false);
    expect(CanonicalFactionClientSchema.safeParse(withoutComplexity).success).toBe(false);
    expect(CanonicalFactionClientSchema.safeParse({ ...withoutComplexity, complexity: 0.4 }).success).toBe(false);
    expect(FactionInputSchema.safeParse(assetPublishingFaction).success).toBe(true);
    expect(CanonicalFactionStoredObject.safeParse(assetPublishingFaction).success).toBe(true);
    expect(CanonicalFactionClientSchema.safeParse(assetPublishingFaction).success).toBe(true);
  });

  it.each([
    ['definition', -0.01],
    ['definition', 1.01],
    ['influence', -0.01],
    ['influence', 1.01],
  ] as const)('rejects %s outside the inclusive zero-to-one range', (field, value) => {
    const background = {
      ...structuredClone(assetPublishingFaction.background),
      [field]: value,
    };

    expect(Background.safeParse(background).success).toBe(false);
  });
});
