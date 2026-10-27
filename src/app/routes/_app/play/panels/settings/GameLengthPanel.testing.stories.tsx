import { testingPreview } from '@sb/preview';
import { MAX_LAST_TURN } from '@shared/play/lastTurn';
import { expect, userEvent } from 'storybook/test';

import { gameLengthPanelMeta } from './GameLengthPanel.stories.fixture';

const meta = testingPreview.meta({ ...gameLengthPanelMeta, title: 'Play/Panels/Settings' });

/** A typed turn is set once the player leaves the field, held within the turns a game allows. */
export const SetsTheLastTurn = meta.story({
  play: async ({ args, canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Last turn' });
    await userEvent.clear(field);
    await userEvent.type(field, '8');
    await expect(args.onLastTurn).not.toHaveBeenCalled();
    await userEvent.tab();
    await expect(args.onLastTurn).toHaveBeenCalledWith(8);
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    await userEvent.tab();
    await expect(args.onLastTurn).toHaveBeenLastCalledWith(MAX_LAST_TURN);
  },
});
