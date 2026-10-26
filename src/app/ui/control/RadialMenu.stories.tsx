import preview from '@sb/preview';
import { useState } from 'react';
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

/* A table stand-in: right-click anywhere opens the ring at the pointer, and anything that closes it lets it go. */
function TryTheRing(props: Readonly<Parameters<typeof RadialMenu>[0]>) {
  const [at, setAt] = useState<{ x: number; y: number } | null>({ x: props.x, y: props.y });
  return (
    <div
      style={{ height: '100vh', background: '#2a1d12' }}
      onContextMenu={(event) => {
        event.preventDefault();
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
