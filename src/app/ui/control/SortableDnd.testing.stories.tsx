import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { SortableListDemo } from './SortableDnd.stories.fixture';

const meta = testingPreview.meta({
  title: 'SortableDnd',
  parameters: { layout: 'centered' },
});

export const VerticalList = meta.story({
  render: () => <SortableListDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    const handle = canvas.getByRole('button', { name: 'Reorder Alpha' });
    /*
     * The runner sizes the story's frame just before the story starts, and Chromium dispatches that resize on the next drawn frame, which can arrive seconds late on CI.
     * dnd-kit cancels a drag on any window resize, so a late resize between the pickup and the drop left the list in its old order (#2309).
     * Resize events run before animation-frame callbacks in the same frame, so starting after one drawn frame lets the resize land first.
     */
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowDown]');
    await waitFor(() =>
      expect(portal.getByText('Draggable item Alpha was moved over droppable area Bravo.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[Space]');
    await waitFor(() =>
      expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        '1. Bravo',
        '2. Alpha',
        '3. Charlie',
      ])
    );
  },
});
