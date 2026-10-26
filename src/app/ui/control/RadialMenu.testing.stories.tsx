import { testingPreview } from '@sb/preview';
import { useState } from 'react';
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

function ClosableRing(props: Readonly<Parameters<typeof RadialMenu>[0]>) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ height: '100vh', background: '#2a1d12' }}>
      {open && <RadialMenu {...props} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** With motion on, closing removes the menu at once; only an unnamed copy plays the close, and it leaves the page soon after. */
export const CloseLeavesAtOnce = meta.story({
  globals: { motion: 'on' },
  render: (args) => <ClosableRing {...args} />,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const page = within(doc.body);
    await expect(await page.findByRole('menu', { name: 'Deck actions' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(page.queryByRole('menu')).toBeNull();
    await expect(page.queryByRole('menuitem', { name: 'Draw a card' })).toBeNull();
    await waitFor(() => expect(doc.querySelector('[data-closing]')).toBeNull());
  },
});
