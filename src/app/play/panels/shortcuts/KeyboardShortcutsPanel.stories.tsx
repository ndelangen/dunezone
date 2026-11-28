import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

/* The keyboard shortcuts panel on its own, in the centre panel that ? and the bar's key button open. */
const frame = panelMeta(PANEL_WINDOWS.shortcuts);
const meta = preview.meta({
  ...frame,
  component: KeyboardShortcutsPanel,
  title: 'Play/Panels/Keyboard shortcuts',
  parameters: { ...frame.parameters, panelFrame: 'centre' },
  globals: { motion: 'on' },
});

/** At the table with nothing held: the panel keys lead the row, and every key the table answers to follows. */
export const AtTheTable = meta.story({
  play: async ({ canvas }) => {
    /* The panel fades in as it opens, so the sheet is read once it has settled. */
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Compass and panels' })).toBeVisible());
    await expect(canvas.getByText('Ping the spot for everyone')).toBeInTheDocument();
    await expect(canvas.getByText('Right now · At the table')).toBeInTheDocument();
  },
});

/** The pointer over a piece: the piece's keys lead the row and glow on the keyboard, and F reads Flip as well as Ally chat. */
export const OverAPiece = meta.story({
  args: { now: ['piece', 'flip', 'turn', 'split', 'draw', 'shuffle'] },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Right now · On a piece')).toBeVisible());
    await expect(canvas.getByRole('button', { name: /^F: Ally chat, Flip it$/ })).toHaveAttribute('data-state', 'now');
  },
});

/** In the Bidding phase: raise, take back, pass and rejoin lead the row. */
export const Bidding = meta.story({ args: { now: ['raise', 'lower', 'pass'] } });

/** Pinned into a slot beside the board, where it scrolls within the slot's default height. */
export const Pinned = meta.story({ parameters: { panelFrame: 'slot' } });
