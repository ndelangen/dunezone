import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

/* The keyboard shortcuts window on its own, in the centre window that ? and the bar's key button open. */
const frame = panelMeta(PANEL_WINDOWS.shortcuts);
const meta = preview.meta({
  ...frame,
  component: KeyboardShortcutsPanel,
  title: 'Play/Panels/Keyboard shortcuts',
  parameters: { ...frame.parameters, panelFrame: 'centre' },
  globals: { motion: 'on' },
});

/** At the table with nothing held: the window keys lead the row, and every key the table answers to follows. */
export const AtTheTable = meta.story({
  play: async ({ canvas }) => {
    /* The window fades in as it opens, so the sheet is read once it has settled. */
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Compass and windows' })).toBeVisible());
    await expect(canvas.getByText('Ping the spot for everyone')).toBeInTheDocument();
    await expect(canvas.getByText('Right now · At the table')).toBeInTheDocument();
  },
});

/** The pointer over a piece: the piece's keys lead the row and glow on the keyboard, and F and G read Flip and Stack. */
export const OverAPiece = meta.story({
  args: { now: ['piece'] },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Right now · Pointer over a piece')).toBeVisible());
    await expect(canvas.getByRole('button', { name: /^F: Ally chat, Flip it$/ })).toHaveAttribute('data-state', 'now');
  },
});

/** In the Bidding phase: raise, take back, pass and rejoin lead the row. */
export const Bidding = meta.story({ args: { now: ['bidding'] } });

/** Pressing a key while the window is open lights its cap and its rows. */
export const PressingAKey = meta.story({
  args: { now: ['piece'] },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Right now · Pointer over a piece')).toBeVisible());
    await userEvent.keyboard('t');
    /* The rows below the keyboard light the key's story; the row of right now has its own copy of the words. */
    const pieces = within(canvas.getByRole('region', { name: 'Pieces' }));
    await waitFor(() =>
      expect(pieces.getByText('Draw from the deck').closest('li')).toHaveAttribute('data-lit', 'true')
    );
  },
});

/** Pinned into a slot beside the board, where it scrolls within the slot's default height. */
export const Pinned = meta.story({ parameters: { panelFrame: 'slot' } });
