import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { RadialMenu } from './RadialMenu';
import { dealToFremen, closeRing, DECK_ACTIONS } from './RadialMenu.stories.fixture';

const meta = testingPreview.meta({
  title: 'RadialMenu',
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

/** Deal steps into a ring of the factions, with Back at its centre; Escape steps out again. */
export const StepIntoDeal = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('menuitem', { name: 'Deal a card' }));
    await userEvent.click(page.getByRole('menuitem', { name: 'Deal 1 to Fremen' }));
    await expect(dealToFremen).toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Draw a card' })).toBeVisible());
    await expect(closeRing).not.toHaveBeenCalled();
  },
});
