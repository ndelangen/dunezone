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

/* A table stand-in: right-click anywhere opens the ring at the pointer, and anything that closes it lets it go. */
function TryTheRing(props: Readonly<Parameters<typeof RadialMenu>[0]>) {
  const [at, setAt] = useState<{ x: number; y: number } | null>({ x: props.x, y: props.y });
  return (
    <div
      style={{ height: '100vh', background: '#2a1d12' }}
      onContextMenu={(event) => {
        event.preventDefault();
        /* A right-click on the ring is its own: it steps back out of Deal's ring. */
        if ((event.target as Element).closest('[data-radial-menu]')) {
          return;
        }
        setAt({ x: event.clientX, y: event.clientY });
      }}
    >
      {at && <RadialMenu {...props} key={`${at.x},${at.y}`} x={at.x} y={at.y} onClose={() => setAt(null)} />}
    </div>
  );
}

/** The ring's motion: it springs open around the pointer and gathers in as it closes; Deal's ring flies out the same way. Right-click anywhere to open it again. */
export const OpenAndClose = meta.story({
  globals: { motion: 'on' },
  render: (args) => <TryTheRing {...args} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('menu', { name: 'Deck actions' })).toHaveFocus();
  },
});
