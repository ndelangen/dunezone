import { testingPreview } from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { SortableRowDemo } from './SortableRow.stories.fixture';

const meta = testingPreview.meta({
  title: 'SortableRow',
  parameters: { layout: 'centered' },
});

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/* A mouse drag as the browser sends it: pressed on one element, moved in small steps to a point, and let go there. */
async function drag(source: HTMLElement, to: { x: number; y: number }, held: () => void = () => {}) {
  const from = source.getBoundingClientRect();
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const pointer = (type: string, x: number, y: number, on: EventTarget) =>
    on.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 1,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
      })
    );
  pointer('pointerdown', start.x, start.y, source);
  for (let step = 1; step <= 12; step++) {
    pointer(
      'pointermove',
      start.x + ((to.x - start.x) * step) / 12,
      start.y + ((to.y - start.y) * step) / 12,
      source.ownerDocument
    );
    await frame();
  }
  held();
  pointer('pointerup', to.x, to.y, source.ownerDocument);
  await frame();
}

const order = (canvas: ReturnType<typeof within>) =>
  canvas.getAllByRole('img').map((tile: HTMLElement) => tile.getAttribute('aria-label'));

const leftHalf = (element: HTMLElement) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 4, y: box.top + box.height / 2 };
};

/** Let go over another tile, a tile moves in front of it; let go off the row, it stays and the row reports where it went; a lost focus drops the drag. */
export const Reorder = meta.story({
  render: () => <SortableRowDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    /* dnd-kit cancels a drag on a window resize, and the runner's own resize lands on the first drawn frame. */
    await frame();
    await drag(canvas.getByRole('img', { name: 'Snooper' }), leftHalf(canvas.getByRole('img', { name: 'Crysknife' })));
    await waitFor(() => expect(order(canvas)).toEqual(['Snooper', 'Crysknife', 'Shield', 'Chaumas', 'Cheap Hero']));

    const output = canvas.getByLabelText('Let go outside');
    const below = output.getBoundingClientRect();
    await drag(canvas.getByRole('img', { name: 'Shield' }), { x: below.left + 4, y: below.bottom + 80 });
    await expect(output).toHaveTextContent('Shield');
    await expect(order(canvas)).toEqual(['Snooper', 'Crysknife', 'Shield', 'Chaumas', 'Cheap Hero']);

    await drag(
      canvas.getByRole('img', { name: 'Cheap Hero' }),
      leftHalf(canvas.getByRole('img', { name: 'Snooper' })),
      () => window.dispatchEvent(new FocusEvent('blur'))
    );
    await expect(order(canvas)).toEqual(['Snooper', 'Crysknife', 'Shield', 'Chaumas', 'Cheap Hero']);
  },
});

/** In a scrolling box that hides part of the row, a tile let go over the hidden part leaves the row, as the pointer is over whatever shows there. */
export const ClippedRow = meta.story({
  render: () => (
    <div data-testid="clip" style={{ height: 50, overflow: 'auto' }}>
      <SortableRowDemo />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await frame();
    const clip = canvas.getByTestId('clip').getBoundingClientRect();
    const crysknife = canvas.getByRole('img', { name: 'Crysknife' }).getBoundingClientRect();
    await drag(canvas.getByRole('img', { name: 'Snooper' }), { x: crysknife.left + 8, y: clip.bottom + 28 });
    await expect(canvas.getByLabelText('Let go outside')).toHaveTextContent('Snooper');
    await expect(order(canvas)).toEqual(['Crysknife', 'Shield', 'Snooper', 'Chaumas', 'Cheap Hero']);
  },
});
