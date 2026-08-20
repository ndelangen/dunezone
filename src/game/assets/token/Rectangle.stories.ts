import preview from '@sb/preview';

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

export const RingAndMutedDecal = meta.story({ args: rectangleTokenFixtures.heighliner });

export const PastTheEdge = meta.story({ args: rectangleTokenFixtures.bleedingOffTheEdge });
