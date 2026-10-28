import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { handActions, handPanelMeta } from './HandPanel.stories.fixture';

/* The Hand window on its own: the viewer's cards and leaders on shelves, each draggable onto the table. */
const meta = preview.meta({ ...handPanelMeta, title: 'Play/Panels/Hand' });

/** A Treachery card drawn into the hand, on its shelf above the faction's leaders. */
export const Hand = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Drag Snooper from hand' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Drag Feyd Rautha from hand' })).toBeVisible();
  },
});

/** Nothing in hand: the window says how a piece gets here. */
export const Empty = meta.story({ args: { actions: handActions([]) } });
