import { Background } from '@shared/factions/schema';
import { describe, expect, it } from 'vitest';

import type { Faction } from '@db/factions';

import { BACKGROUND_PATTERN_CATALOGUE } from './backgroundPatternCatalogue';
import {
  backgroundRecipeCount,
  randomizeBackground,
  randomizeBackgroundColors,
  randomizeBackgroundTreatment,
  withRandomPattern,
} from './backgroundRandomizer';

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

  it('never returns the exact current catalogue combination', () => {
    for (let recipeIndex = 0; recipeIndex < backgroundRecipeCount; recipeIndex += 1) {
      for (let patternIndex = 0; patternIndex < BACKGROUND_PATTERN_CATALOGUE.length; patternIndex += 1) {
        const sampledValues = [
          (recipeIndex + 0.5) / backgroundRecipeCount,
          (patternIndex + 0.5) / BACKGROUND_PATTERN_CATALOGUE.length,
        ];
        const current = randomizeBackground(original, () => sampledValues.shift() ?? 0);
        const repeatedValues = [
          (recipeIndex + 0.5) / backgroundRecipeCount,
          (patternIndex + 0.5) / BACKGROUND_PATTERN_CATALOGUE.length,
        ];
        const next = randomizeBackground(current, () => repeatedValues.shift() ?? 0);

        expect(next).not.toEqual(current);
        expect(Background.safeParse(next).success).toBe(true);
        expect(BACKGROUND_PATTERN_CATALOGUE.some((option) => option.image === next.image)).toBe(true);
      }
    }
  });
});

/*
 * A random tool that can hand back the value already showing reads as a dead button, and with a
 * catalogue of N entries it does so about one press in N. Each partial tool is rolled against every
 * index so the guarantee holds for the whole catalogue rather than for a lucky seed.
 */
it('partial random tools never return the value already showing', () => {
  const start = randomizeBackground(original, () => 0);
  for (let index = 0; index < backgroundRecipeCount; index += 1) {
    const roll = () => index / backgroundRecipeCount;
    expect(withRandomPattern(start, roll).image).not.toEqual(start.image);
    const treatment = randomizeBackgroundTreatment(start, roll);
    expect([treatment.invert, treatment.definition, treatment.influence]).not.toEqual([
      start.invert,
      start.definition,
      start.influence,
    ]);
    expect(randomizeBackgroundColors(start, roll).colors).not.toEqual(start.colors);
  }
});
