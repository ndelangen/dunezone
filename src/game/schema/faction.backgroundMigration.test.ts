import { describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../fixtures/assetPublishingFaction';
import {
  Background,
  FactionInputSchema,
  FactionStoredSchema,
  LegacyFactionInputSchema,
  migrateLegacyBackground,
  reconcileLegacyFactionUpdate,
  toLegacyFactionInput,
} from './faction';

describe('faction background migration contract', () => {
  it('maps legacy fields without changing their values and defaults inversion on', () => {
    expect(
      migrateLegacyBackground({
        image: '/image/texture/021.jpg',
        colors: ['#112233', '#445566'],
        strength: 0.36,
        opacity: 0.88,
      })
    ).toEqual({
      image: '/image/texture/021.jpg',
      colors: ['#112233', '#445566'],
      invert: true,
      definition: 0.36,
      influence: 0.88,
    });
  });

  it('normalizes a complete legacy faction while canonical input rejects legacy fields', () => {
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
    expect(FactionStoredSchema.parse(legacy).background).toEqual({
      image: '/image/texture/021.jpg',
      colors: ['#4b4c0d', '#d9c979'],
      invert: true,
      definition: 0.55,
      influence: 1,
    });
  });

  it('keeps public reads compatible with the deployed legacy client during widening', () => {
    const canonical = {
      ...structuredClone(assetPublishingFaction),
      background: {
        ...structuredClone(assetPublishingFaction.background),
        invert: false,
      },
      planet: [
        {
          image: '/image/planet/01.png' as const,
          name: 'Curated world',
          description: 'Repository-owned artwork.',
        },
      ],
    };
    const legacy = toLegacyFactionInput(canonical);

    expect(LegacyFactionInputSchema.parse(legacy).background).toEqual({
      image: canonical.background.image,
      colors: canonical.background.colors,
      strength: canonical.background.definition,
      opacity: canonical.background.influence,
    });
    expect(legacy.planet?.[0].image).toBe('https://dune.zone/image/planet/01.png');
    expect(LegacyFactionInputSchema.safeParse(legacy).success).toBe(true);

    const reconciled = reconcileLegacyFactionUpdate(legacy, canonical);
    expect(reconciled?.background.invert).toBe(false);
    expect(reconciled?.planet?.[0].image).toBe('/image/planet/01.png');
  });

  it('keeps the frozen legacy storage contract wider than current name semantics', () => {
    const legacy = toLegacyFactionInput(assetPublishingFaction);
    legacy.name = '';

    expect(FactionInputSchema.safeParse(legacy).success).toBe(false);
    expect(FactionStoredSchema.parse(legacy).name).toBe('');
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
