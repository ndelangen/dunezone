import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { midGameTracker } from './tracker.stories.fixture';
import { TrackerWindow } from './TrackerWindow.stories.fixture';

/*
 * The chosen option, Auction first, in its own pinned compass window.
 * Turn 2 of a six-faction Dreamrules game, with Hunter Seeker up for bid. Everything is live.
 */
const meta = preview.meta({
  title: 'Play/Panels/Treachery tracker',
  parameters: { layout: 'fullscreen' },
});

/** The card on bid, whole, beside the tokens that record who won it; one turn's auction at a time; a row per faction. */
export const Tracker = meta.story({
  render: () => <TrackerWindow initial={midGameTracker} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Fremen won Hunter Seeker' })).toBeVisible();
  },
});

/*
 * The table shows the Emperor holding one card fewer than the tracker gives it, and no face-up card says which:
 * a caution mark at the end of the row asks the player to pick the card that left.
 */
export const ACardLeftAHand = meta.story({
  render: () => <TrackerWindow initial={midGameTracker} losses={{ emperor: 1 }} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(/^Emperor holds one card fewer/)).toBeVisible();
  },
});
