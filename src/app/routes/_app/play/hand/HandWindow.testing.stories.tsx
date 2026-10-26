import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { at, handWindowMeta } from './HandWindow.stories.fixture';

const meta = testingPreview.meta({
  ...handWindowMeta,
  title: 'Play/Windows/Hand and spice',
  parameters: { layout: 'fullscreen' },
});

/** Setting a card aside moves it to the side-table, every piece offers the same two actions, and withdrawing takes spice out of the reserve. */
export const HandActions = meta.story({
  beforeEach: at('Battle plan'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* A right-click on a card sets it on the side-table, where the side-table window shows it. */
    const crysknife = await page.findByRole('button', { name: 'Drag Crysknife from hand' }, { timeout: 30_000 });
    await userEvent.pointer({ keys: '[MouseRight]', target: crysknife });
    await userEvent.click(await page.findByRole('menuitem', { name: 'Move to private side-table' }));
    await expect(
      page.findByRole('button', { name: 'Move Crysknife on private side-table' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Drag Crysknife from hand' })).toBeNull();
    /* The hand knows nothing of battles: a leader's menu offers the same two actions as a card's. */
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: page.getByRole('button', { name: 'Drag Lady Jessica from hand' }),
    });
    await expect(page.findAllByRole('menuitem')).resolves.toHaveLength(2);
    await userEvent.keyboard('{Escape}');
    /* Stepping the amount up and withdrawing takes it out of the reserve. */
    const before = Number(page.getByLabelText('Spice reserve balance').textContent);
    await userEvent.click(page.getByRole('button', { name: 'More: Spice to withdraw' }));
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    await waitFor(() => expect(page.getByLabelText('Spice reserve balance')).toHaveTextContent(String(before - 2)));
  },
});

/* A mouse drag as the browser sends it: pressed on one piece, moved in small steps onto the first half of another, and let go there. */
async function dragOnto(source: HTMLElement, target: HTMLElement, held: () => void = () => {}) {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const end = { x: to.left + to.width / 4, y: to.top + to.height / 2 };
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
      start.x + ((end.x - start.x) * step) / 12,
      start.y + ((end.y - start.y) * step) / 12,
      source.ownerDocument
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  held();
  pointer('pointerup', end.x, end.y, source.ownerDocument);
}

const treacheryOrder = (page: ReturnType<typeof within>) =>
  within(page.getByRole('region', { name: 'Treachery' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));

/** Dragging a card along its shelf makes room where it would land, and letting go there puts the hand in that order. */
export const ReorderByDrag = meta.story({
  beforeEach: at('Battle plan'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const shield = await page.findByRole('button', { name: 'Drag Shield from hand' }, { timeout: 30_000 });
    const crysknife = page.getByRole('button', { name: 'Drag Crysknife from hand' });
    const before = treacheryOrder(page);
    await expect(before.indexOf('Drag Shield from hand')).toBeGreaterThan(before.indexOf('Drag Crysknife from hand'));
    /* While it is held, the pieces it passed slide aside rather than jump. */
    let slide = '';
    await dragOnto(shield, crysknife, () => {
      slide = crysknife.parentElement?.parentElement?.style.transition ?? '';
    });
    await expect(slide).toContain('transform');
    const after = before.filter((label) => label !== 'Drag Shield from hand');
    after.splice(after.indexOf('Drag Crysknife from hand'), 0, 'Drag Shield from hand');
    await waitFor(() => expect(treacheryOrder(page)).toEqual(after));
    /* Let go off its shelf, the piece settles back where it was. */
    await dragOnto(
      page.getByRole('button', { name: 'Drag Shield from hand' }),
      page.getByLabelText('Spice reserve balance')
    );
    /* A drag the window lost focus during is dropped: letting go on its return moves nothing. */
    await dragOnto(
      page.getByRole('button', { name: 'Drag Crysknife from hand' }),
      page.getByRole('button', { name: 'Drag Shield from hand' }),
      () => window.dispatchEvent(new FocusEvent('blur'))
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await expect(treacheryOrder(page)).toEqual(after);
  },
});

/** A card dragged off its shelf onto the private side-table is laid there. */
export const DragToSideTable = meta.story({
  beforeEach: at('Battle plan'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const crysknife = await page.findByRole('button', { name: 'Drag Crysknife from hand' }, { timeout: 30_000 });
    await dragOnto(crysknife, page.getByText(/Drag a piece here from your hand/));
    await expect(
      page.findByRole('button', { name: 'Move Crysknife on private side-table' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(() => expect(page.queryByRole('button', { name: 'Drag Crysknife from hand' })).toBeNull());
  },
});
