import type { Faction } from '@db/factions';

import { BACKGROUND_PATTERN_CATALOGUE } from './backgroundPatternCatalogue';

type FactionBackground = Faction['background'];
type BackgroundRecipe = Omit<FactionBackground, 'image'>;

const RECIPES = [
  {
    colors: ['#172f33', '#d2a85f'],
    invert: true,
    definition: 0.74,
    influence: 0.72,
  },
  {
    colors: [
      {
        type: 'linear',
        angle: 135,
        stops: [
          ['#182d42', 0],
          ['#496f84', 0.55],
          ['#d8c5a1', 1],
        ],
      },
      '#c17932',
    ],
    invert: false,
    definition: 0.62,
    influence: 0.58,
  },
  {
    colors: [
      '#3a1838',
      {
        type: 'radial',
        x: 36,
        y: 34,
        r: 76,
        stops: [
          ['#f0d484', 0],
          ['#b45642', 0.52],
          ['#47243f', 1],
        ],
      },
    ],
    invert: true,
    definition: 0.86,
    influence: 0.67,
  },
  {
    colors: [
      {
        type: 'radial',
        x: 68,
        y: 28,
        r: 86,
        stops: [
          ['#dce0c5', 0],
          ['#66846c', 0.58],
          ['#263f48', 1],
        ],
      },
      {
        type: 'linear',
        angle: 42,
        stops: [
          ['#e5ca78', 0],
          ['#8b5f2f', 1],
        ],
      },
    ],
    invert: false,
    definition: 0.47,
    influence: 0.44,
  },
  {
    colors: ['#20191a', '#a6382c'],
    invert: false,
    definition: 0.95,
    influence: 0.82,
  },
  {
    colors: [
      {
        type: 'linear',
        angle: 295,
        stops: [
          ['#15132b', 0],
          ['#392d67', 0.5],
          ['#9879c1', 1],
        ],
      },
      {
        type: 'radial',
        x: 52,
        y: 45,
        r: 72,
        stops: [
          ['#efe2a9', 0],
          ['#608c91', 1],
        ],
      },
    ],
    invert: true,
    definition: 0.55,
    influence: 0.63,
  },
] as const satisfies readonly BackgroundRecipe[];

function randomIndex(length: number, random: () => number): number {
  if (length <= 1) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

export function randomPatternImage(random: () => number = Math.random): string {
  const option =
    BACKGROUND_PATTERN_CATALOGUE[randomIndex(BACKGROUND_PATTERN_CATALOGUE.length, random)];
  if (!option) {
    throw new Error('The background pattern catalogue must contain at least one pattern');
  }
  return option.image;
}

export function withRandomPattern(
  background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  return {
    ...structuredClone(background),
    image: randomPatternImage(random),
  };
}

export function randomizeBackground(
  _background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  const recipe = RECIPES[randomIndex(RECIPES.length, random)];
  if (!recipe) {
    throw new Error('The background recipe catalogue must contain at least one recipe');
  }
  return {
    ...structuredClone(recipe),
    image: randomPatternImage(random),
  };
}

export function randomizeBackgroundTreatment(
  background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  const recipe = RECIPES[randomIndex(RECIPES.length, random)];
  if (!recipe) return structuredClone(background);
  return {
    ...structuredClone(background),
    invert: recipe.invert,
    definition: recipe.definition,
    influence: recipe.influence,
  };
}

export function randomizeBackgroundColors(
  background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  const recipe = RECIPES[randomIndex(RECIPES.length, random)];
  if (!recipe) return structuredClone(background);
  return {
    ...structuredClone(background),
    colors: structuredClone(recipe.colors),
  };
}

export const backgroundRecipeCount = RECIPES.length;
