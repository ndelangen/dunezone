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
  if (length <= 1) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function backgroundsMatch(left: FactionBackground, right: FactionBackground): boolean {
  return (
    left.image === right.image &&
    left.invert === right.invert &&
    left.definition === right.definition &&
    left.influence === right.influence &&
    JSON.stringify(left.colors) === JSON.stringify(right.colors)
  );
}

/**
 * A catalogue entry that differs from what the author already has.
 *
 * A random tool that can hand back the current value reads as a dead button, and with a catalogue of N entries it does so roughly one press in N.
 * `randomizeBackground` has always walked forward from its roll to avoid that;
 * these partial tools now do the same for the field each one owns.
 * Undefined only when every entry matches, which means the catalogue cannot express a change.
 */
function pickDifferent<T>(
  entries: readonly T[],
  random: () => number,
  isCurrent: (entry: T) => boolean
): T | undefined {
  const start = randomIndex(entries.length, random);
  for (let step = 0; step < entries.length; step += 1) {
    const entry = entries[(start + step) % entries.length];
    if (entry && !isCurrent(entry)) {
      return entry;
    }
  }
  return undefined;
}

function randomPatternImage(
  current: FactionBackground['image'],
  random: () => number = Math.random
): FactionBackground['image'] {
  if (BACKGROUND_PATTERN_CATALOGUE.length === 0) {
    throw new Error('The background pattern catalogue must contain at least one pattern');
  }
  const option = pickDifferent(BACKGROUND_PATTERN_CATALOGUE, random, (candidate) => candidate.image === current);
  return option?.image ?? current;
}

export function withRandomPattern(
  background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  return {
    ...structuredClone(background),
    image: randomPatternImage(background.image, random),
  };
}

export function randomizeBackground(
  background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  const recipeIndex = randomIndex(RECIPES.length, random);
  const recipe = RECIPES[recipeIndex];
  if (!recipe) {
    throw new Error('The background recipe catalogue must contain at least one recipe');
  }
  const patternIndex = randomIndex(BACKGROUND_PATTERN_CATALOGUE.length, random);
  const pattern = BACKGROUND_PATTERN_CATALOGUE[patternIndex];
  if (!pattern) {
    throw new Error('The background pattern catalogue must contain at least one pattern');
  }
  const candidate: FactionBackground = {
    ...structuredClone(recipe),
    image: pattern.image,
  };
  if (!backgroundsMatch(candidate, background)) {
    return candidate;
  }

  const nextPattern = BACKGROUND_PATTERN_CATALOGUE[(patternIndex + 1) % BACKGROUND_PATTERN_CATALOGUE.length];
  if (nextPattern && nextPattern.image !== candidate.image) {
    return { ...candidate, image: nextPattern.image };
  }

  const nextRecipe = RECIPES[(recipeIndex + 1) % RECIPES.length];
  if (nextRecipe && JSON.stringify(nextRecipe) !== JSON.stringify(recipe)) {
    return { ...structuredClone(nextRecipe), image: candidate.image };
  }

  throw new Error('Random all requires at least two distinct catalogue combinations');
}

export function randomizeBackgroundTreatment(
  background: FactionBackground,
  random: () => number = Math.random
): FactionBackground {
  const recipe = pickDifferent(
    RECIPES,
    random,
    (candidate) =>
      candidate.invert === background.invert &&
      candidate.definition === background.definition &&
      candidate.influence === background.influence
  );
  if (!recipe) {
    return structuredClone(background);
  }
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
  const current = JSON.stringify(background.colors);
  const recipe = pickDifferent(RECIPES, random, (candidate) => JSON.stringify(candidate.colors) === current);
  if (!recipe) {
    return structuredClone(background);
  }
  return {
    ...structuredClone(background),
    colors: structuredClone(recipe.colors),
  };
}

export const backgroundRecipeCount = RECIPES.length;
