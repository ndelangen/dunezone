import { testingPreview } from '@sb/preview';
import { GF9_STRONGHOLD_DECK } from '@shared/assets/gf9StrongholdDeck';
import { STANDARD_STORM_CARDBACK } from '@shared/assets/standardStormDeck';
import { expect } from 'storybook/test';

import { CardBack } from './Back';
import { verifyLabelPaint } from './Back.stories.fixture';

const meta = testingPreview.meta({
  title: 'Back',
  component: CardBack,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});
export const StormDeckLabel = meta.story({ args: STANDARD_STORM_CARDBACK, play: verifyLabelPaint });
export const StrongholdDeck = meta.story({
  args: GF9_STRONGHOLD_DECK.cardback,
  play: async ({ canvasElement }) => {
    const images = canvasElement.querySelectorAll('img');
    await expect(images).toHaveLength(1);
    const image = images[0]!;
    await image.decode();
    await expect(getComputedStyle(image).mixBlendMode).toBe('normal');
    await expect(image.getBoundingClientRect().height).toBe(286);
  },
});
