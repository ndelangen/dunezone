import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { nothingLaid, sideTablePanelMeta } from './PrivateSideTablePanel.stories.fixture';

/* The Private side-table window on its own: the viewer's own patch of table, where pieces from the hand lie where they were put. */
const meta = preview.meta({ ...sideTablePanelMeta, title: 'Play/Panels/Private side-table' });

/** A Treachery card and a leader turned a quarter, laid out where they were put. */
export const SideTable = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.findByRole('button', { name: 'Move Snooper on private side-table' })).resolves.toBeVisible();
  },
});

/** Nothing laid out yet: the window says how a piece gets here. */
export const Empty = meta.story({ args: { hand: nothingLaid() } });
