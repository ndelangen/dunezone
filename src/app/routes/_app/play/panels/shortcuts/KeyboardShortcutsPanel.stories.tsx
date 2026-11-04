import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

/* The keyboard shortcuts cheat sheet on its own, in the centre window that ? and the bar's key button open. */
const frame = panelMeta(PANEL_WINDOWS.shortcuts);
const meta = preview.meta({
  ...frame,
  component: KeyboardShortcutsPanel,
  title: 'Play/Panels/Keyboard shortcuts',
  parameters: { ...frame.parameters, panelFrame: 'centre' },
});

/** Every key the table answers to, grouped by what it is for. */
export const CheatSheet = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Compass and windows' })).toBeVisible();
    await expect(canvas.getByText('Ping the spot under the pointer for everyone')).toBeVisible();
  },
});

/** Pinned into a slot beside the board, where it scrolls within the slot's default height. */
export const Pinned = meta.story({ parameters: { panelFrame: 'slot' } });
