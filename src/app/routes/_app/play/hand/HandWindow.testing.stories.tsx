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

/* A native drag from one piece to another, as the browser sends it: the drag starts, passes over the target's first half, and drops. */
function dragOnto(source: HTMLElement, target: HTMLElement) {
  const dataTransfer = new DataTransfer();
  const box = target.getBoundingClientRect();
  const at = {
    bubbles: true,
    cancelable: true,
    dataTransfer,
    clientX: box.left + 2,
    clientY: box.top + box.height / 2,
  };
  source.dispatchEvent(new DragEvent('dragstart', at));
  return {
    over: () => target.dispatchEvent(new DragEvent('dragover', at)),
    drop: () => target.dispatchEvent(new DragEvent('drop', at)),
    end: () => source.dispatchEvent(new DragEvent('dragend', at)),
  };
}

const treacheryOrder = (page: ReturnType<typeof within>) =>
  within(page.getByRole('region', { name: 'Treachery' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));

/** Dragging a card along its shelf opens a gap where it would land, and dropping it there puts the hand in that order. */
export const ReorderByDrag = meta.story({
  beforeEach: at('Battle plan'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const shield = await page.findByRole('button', { name: 'Drag Shield from hand' }, { timeout: 30_000 });
    const crysknife = page.getByRole('button', { name: 'Drag Crysknife from hand' });
    const before = treacheryOrder(page);
    await expect(before.indexOf('Drag Shield from hand')).toBeGreaterThan(before.indexOf('Drag Crysknife from hand'));
    const drag = dragOnto(shield, crysknife);
    /* The browser keeps sending dragover while the pointer rests over the target. */
    await waitFor(() => {
      drag.over();
      return expect(crysknife.parentElement).toHaveAttribute('data-gap', 'before');
    });
    drag.drop();
    drag.end();
    const after = before.filter((label) => label !== 'Drag Shield from hand');
    after.splice(after.indexOf('Drag Crysknife from hand'), 0, 'Drag Shield from hand');
    await waitFor(() => expect(treacheryOrder(page)).toEqual(after));
  },
});
