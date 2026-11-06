import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { KeyboardShortcutsPanel } from './KeyboardShortcutsPanel';

const frame = panelMeta(PANEL_WINDOWS.shortcuts);
const meta = testingPreview.meta({
  ...frame,
  component: KeyboardShortcutsPanel,
  title: 'Play/Panels/Keyboard shortcuts',
  parameters: { ...frame.parameters, panelFrame: 'centre' },
});

/** Pressing a key while the panel is open lights its cap and its rows. */
export const PressingAKey = meta.story({
  args: { now: ['piece', 'flip', 'turn', 'split', 'draw', 'shuffle'] },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText('Right now · On a piece')).toBeVisible());
    await userEvent.keyboard('t');
    /* The rows below the keyboard light the key's story; the row of right now has its own copy of the words. */
    const pieces = within(canvas.getByRole('region', { name: 'Pieces' }));
    await waitFor(() =>
      expect(pieces.getByText('Draw from the deck').closest('li')).toHaveAttribute('data-lit', 'true')
    );
  },
});
