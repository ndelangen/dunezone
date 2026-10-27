import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { handPanelMeta } from './HandPanel.stories.fixture';

const meta = testingPreview.meta({ ...handPanelMeta, title: 'Play/Panels/Hand' });

/** A piece's right-click menu plays it in front of the viewer or sets it on the private side-table. */
export const PieceMenu = meta.story({
  play: async ({ args, canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const card = canvas.getByRole('button', { name: 'Drag Snooper from hand' });
    await userEvent.pointer({ keys: '[MouseRight]', target: card });
    await userEvent.click(await page.findByRole('menuitem', { name: 'Play in front of me' }));
    await expect(args.actions.playInFront).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'treachery-card-loose' })
    );
    await userEvent.pointer({ keys: '[MouseRight]', target: card });
    await userEvent.click(await page.findByRole('menuitem', { name: 'Move to private side-table' }));
    await expect(args.actions.toSideTable).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'treachery-card-loose' }),
      expect.any(Number)
    );
  },
});
