import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { rectangleTokenFixtures } from '../../fixtures/rectangleTokens';
import { RectangleToken } from './Rectangle';

const meta = preview.meta({
  component: RectangleToken,
  globals: {
    viewport: {
      value: 'tokenRectangle',
    },
  },
});

export const Empty = meta.story({ args: rectangleTokenFixtures.empty });

export const PlacedComposition = meta.story({ args: rectangleTokenFixtures.kwisatzHaderach });

/** A muted decal draws at 35% of its authored opacity, so the projectile reads as a cutout behind the label. */
export const RingAndMutedDecal = meta.story({
  args: rectangleTokenFixtures.heighliner,
  play: async ({ args, canvasElement }) => {
    const decal = args.decals[0]!;
    const layer = canvasElement.querySelector(`use[*|href="${decal.id}#root"]`)?.parentElement;
    await expect(Number(layer?.getAttribute('opacity'))).toBeCloseTo(decal.opacity * 0.35);
  },
});

export const PastTheEdge = meta.story({ args: rectangleTokenFixtures.bleedingOffTheEdge });
