import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SharedInventoryPanel } from './SharedInventoryPanel';
import { inventoryArgs, inWindow } from './SharedInventoryPanel.stories.fixture';

const meta = testingPreview.meta({
  title: 'Play/Panels/Shared table inventory',
  component: SharedInventoryPanel,
  decorators: [inWindow],
  args: inventoryArgs(),
});

/** A shelf's + asks for the catalogue on that shelf alone, and the tech token shelf's draw asks for a random token. */
export const ShelfActions = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add tech tokens from the catalogue' }));
    await expect(args.inventory.catalogue?.toggleShelf).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'token-tech', spawnType: 'token-tech' })
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Draw random tech token' }));
    await expect(args.inventory.draw.run).toHaveBeenCalledOnce();
  },
});
