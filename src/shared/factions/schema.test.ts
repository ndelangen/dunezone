import { describe, expect, it } from 'vitest';

import { assetPublishingFaction } from './fixtures/assetPublishingFaction';
import { Background, CanonicalFactionStoredSchema, FactionInputSchema } from './schema';

describe('faction schema', () => {
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
    expect(CanonicalFactionStoredSchema.safeParse(legacy).success).toBe(false);
  });

  it('keeps canonical storage wider than current name semantics', () => {
    const historical = structuredClone(assetPublishingFaction);
    historical.name = '';

    expect(FactionInputSchema.safeParse(historical).success).toBe(false);
    expect(CanonicalFactionStoredSchema.parse(historical).name).toBe('');
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
