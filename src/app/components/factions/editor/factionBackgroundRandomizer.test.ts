import { describe, expect, it } from 'vitest';

import type { Faction } from '@db/factions';
import { Background } from '@game/schema/faction';

import { BACKGROUND_PATTERN_CATALOGUE } from './backgroundPatternCatalogue';
import {
  backgroundRecipeCount,
  randomizeBackground,
  withRandomPattern,
} from './factionBackgroundRandomizer';

const original: Faction['background'] = {
  image: '/image/texture/021.jpg',
  colors: ['#112233', '#445566'],
  invert: true,
  definition: 0.5,
  influence: 0.75,
};

describe('background studio random actions', () => {
  it('exposes the complete public pattern library', () => {
    expect(BACKGROUND_PATTERN_CATALOGUE).toHaveLength(75);
    expect(new Set(BACKGROUND_PATTERN_CATALOGUE.map((option) => option.image))).toHaveLength(75);
    expect(BACKGROUND_PATTERN_CATALOGUE).toContainEqual({
      image: '/image/texture/021.jpg',
      label: 'Texture 021',
    });
  });

  it('random pattern changes only the image', () => {
    const next = withRandomPattern(original, () => 0.99);

    expect(next.image).not.toBe(original.image);
    expect({ ...next, image: original.image }).toEqual(original);
    expect(original.image).toBe('/image/texture/021.jpg');
  });

  it('every curated random-everything recipe is schema-valid', () => {
    for (let recipeIndex = 0; recipeIndex < backgroundRecipeCount; recipeIndex += 1) {
      const values = [recipeIndex / backgroundRecipeCount + 0.001, 0.42];
      const next = randomizeBackground(original, () => values.shift() ?? 0);
      expect(Background.safeParse(next).success).toBe(true);
      expect(BACKGROUND_PATTERN_CATALOGUE.some((option) => option.image === next.image)).toBe(true);
    }
  });
});
