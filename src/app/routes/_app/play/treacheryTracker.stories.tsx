import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { sandboxReady } from './sandbox.stories.fixture';
import { atreidesSandbox, trackerMeta } from './treacheryTracker.stories.fixture';

const meta = preview.meta({ ...trackerMeta, title: 'Play/Treachery tracker' });

/**
 * A live table to try the tracker by hand: the recorded game at the Bidding phase, viewed as House Atreides.
 * Draw a card off the Treachery deck, or Pull one out while peeking at the deck, then right-click it and Peek: the tracker puts it up for bid.
 * Click a faction token to record who won it, or dismiss it with "Not up for bid".
 * The Play debugger panel restarts the table.
 */
export const Sandbox = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(atreidesSandbox),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await sandboxReady(page);
    await openTab(page, 'Treachery tracker');
    await expect(page.findByText(/^Deck \d+/, undefined, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
