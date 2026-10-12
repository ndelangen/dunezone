import preview from '@sb/preview';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { RadialMenu } from './RadialMenu';
import type { RadialAction } from './RadialMenu';

const FACTIONS = ['Atreides', 'Harkonnen', 'Emperor', 'Spacing Guild', 'Fremen', 'Bene Gesserit'];
const dealToFremen = fn();
const closeRing = fn();

const DECK_ACTIONS: RadialAction[] = [
  { key: 'peek', label: 'Peek at the deck', icon: 'peek', onSelect: fn() },
  { key: 'draw', label: 'Draw a card', icon: 'draw', onSelect: fn() },
  {
    key: 'deal',
    label: 'Deal a card',
    icon: 'deal',
    targetsLabel: 'Deal 1 card to…',
    targets: FACTIONS.map((name) => ({
      key: name,
      label: `Deal 1 to ${name}`,
      name,
      face: name.slice(0, 2),
      onSelect: name === 'Fremen' ? dealToFremen : fn(),
    })),
  },
  { key: 'shuffle', label: 'Shuffle', icon: 'shuffle', shortcut: 'R', onSelect: fn() },
  { key: 'delete', label: 'Hold to delete permanently', icon: 'delete', held: true, onSelect: fn() },
];

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
