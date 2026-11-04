import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { GAME_LOG } from '../../game.stories.fixture';
import { DELETION_ENTRY, logPage, logPanelMeta } from './LogPanel.stories.fixture';

const meta = testingPreview.meta({ ...logPanelMeta, title: 'Play/Panels/Log' });

/** An older page reads further back or returns to the newest. */
export const PagesThroughTheLog = meta.story({
  args: { page: logPage(GAME_LOG, { more: true, latest: false }) },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Earlier entries' }));
    await expect(args.onEarlier).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Latest entries' }));
    await expect(args.onLatest).toHaveBeenCalledOnce();
  },
});

/** Restore sends the deletion its entry names. */
export const RestoresADeletion = meta.story({
  args: { page: logPage([DELETION_ENTRY, ...GAME_LOG]) },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Restore' }));
    await expect(args.onRestore).toHaveBeenCalledWith('42');
  },
});
