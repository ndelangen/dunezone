import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { TUTORIAL_CHAPTERS, TUTORIAL_PARTS } from './chapters';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Landing',
  args: { path: '/tutorial' },
});

/** Every chapter as a tile, in rows by part; a chapter not yet built shows as coming soon and opens nothing. */
export const Landing = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Learn to play', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    for (const part of TUTORIAL_PARTS) {
      await expect(page.getByRole('list', { name: part })).toBeVisible();
    }
    await expect(page.getAllByRole('listitem')).toHaveLength(TUTORIAL_CHAPTERS.length);
    await expect(page.getAllByText('Coming soon')).toHaveLength(TUTORIAL_CHAPTERS.length);
    await expect(page.queryByRole('link', { name: /Battle/ })).toBeNull();
  },
});
