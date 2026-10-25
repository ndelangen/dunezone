import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { RadialMenu } from './RadialMenu';
import { closeRing, DECK_ACTIONS } from './RadialMenu.stories.fixture';

const meta = preview.meta({
  component: RadialMenu,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'Deck actions',
    hub: '12 cards',
    x: 360,
    y: 260,
    onClose: closeRing,
    actions: DECK_ACTIONS,
  },
  render: (args) => (
    <div style={{ height: '100vh', background: '#2a1d12' }}>
      <RadialMenu {...args} />
    </div>
  ),
});

/** A deck's ring: one round action per direction, the card count beside it, and delete held top left. */
export const Deck = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole('menu', { name: 'Deck actions' });
    await expect(menu).toHaveFocus();
    /* The ring opens with a short scale-in, so its items read as visible once that settles. */
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Shuffle' })).toBeVisible());
  },
});
