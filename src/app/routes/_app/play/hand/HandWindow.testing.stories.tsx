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
