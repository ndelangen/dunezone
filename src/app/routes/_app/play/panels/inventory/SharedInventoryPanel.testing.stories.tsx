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
    await expect(args.inventory.draw?.run).toHaveBeenCalledOnce();
  },
});

/** Requests stay at the top while the inventory shelves scroll. */
export const RequestsStayVisible = meta.story({
  args: { requests: <div data-test-request>Pending approval</div> },
  play: async ({ canvasElement }) => {
    const request = canvasElement.querySelector<HTMLElement>('[data-test-request]')!;
    const scroll = request.closest<HTMLElement>('[class*="body_"]')!;
    scroll.style.maxHeight = '180px';
    const before = request.getBoundingClientRect().top;
    scroll.scrollTop = 200;
    await expect(scroll.scrollTop).toBeGreaterThan(0);
    await expect(Math.abs(request.getBoundingClientRect().top - before)).toBeLessThan(2);
  },
});

/** An observer only looks: the shelves and their pieces show, with no add, draw or drag handle, not even greyed. */
export const ObserverSeesNoActions = meta.story({
  args: { inventory: { ...inventoryArgs().inventory, observing: true, draw: null, catalogue: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shelf = canvas.getByRole('region', { name: 'Tech tokens' });
    await expect(shelf).toBeVisible();
    await expect(within(shelf).getAllByRole('group').length).toBeGreaterThan(0);
    await expect(within(shelf).queryAllByRole('button')).toHaveLength(0);
    await expect(canvas.queryByRole('button', { name: /from the catalogue|Draw random|onto the table/ })).toBeNull();
  },
});
