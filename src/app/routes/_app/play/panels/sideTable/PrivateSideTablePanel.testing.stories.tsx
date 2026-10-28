import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { sideTablePanelMeta } from './PrivateSideTablePanel.stories.fixture';

const meta = testingPreview.meta({ ...sideTablePanelMeta, title: 'Play/Panels/Private side-table' });

/** A piece's right-click menu turns it a quarter, plays it onto the table, or takes it back into the hand. */
export const PieceMenu = meta.story({
  play: async ({ args, canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const card = await canvas.findByRole('button', { name: 'Move Snooper on private side-table' });
    const choose = async (item: string) => {
      await userEvent.pointer({ keys: '[MouseRight]', target: card });
      await userEvent.click(await page.findByRole('menuitem', { name: item }));
    };
    await choose('Turn right');
    await expect(args.onLay).toHaveBeenLastCalledWith('treachery-card-loose', { x: 0.3, y: 0.5, turn: 6 });
    await choose('Place on table');
    await expect(args.onPlace).toHaveBeenCalledWith('treachery-card-loose');
    await choose('Move to hand');
    await expect(args.onLay).toHaveBeenLastCalledWith('treachery-card-loose', null);
  },
});
