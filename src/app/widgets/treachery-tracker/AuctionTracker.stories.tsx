import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { midGameTracker } from './tracker.stories.fixture';
import { TrackerWindow } from './TrackerWindow.stories.fixture';

/*
 * The chosen option, Auction first, in its own pinned compass window with the config gear in the title bar.
 * Turn 2 of a six-faction Dreamrules game, with Hunter Seeker up for bid. Everything is live.
 */
const meta = preview.meta({
  title: 'Auction first',
  parameters: { layout: 'fullscreen' },
});

/** The card on bid, whole, beside the tokens that record who won it; one turn's auction at a time; a row per faction. */
export const Tracker = meta.story({
  render: () => <TrackerWindow initial={midGameTracker} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Fremen won Hunter Seeker' })).toBeVisible();
  },
});

/** Behind the gear: the deck the tracker copies, which factions play, and their seat order. */
export const Config = meta.story({
  render: () => <TrackerWindow initial={midGameTracker} configuring />,
});
