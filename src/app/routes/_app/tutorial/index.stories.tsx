import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { TUTORIAL_CHAPTERS, TUTORIAL_PARTS } from './chapters';
import { CHAPTER_SCRIPTS } from './chapterScripts/scripts';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Landing',
  args: { path: '/tutorial' },
});

/** Every chapter as a tile, in rows by part; a built chapter's tile opens it, and one not yet built shows as coming soon. */
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
    const built = TUTORIAL_CHAPTERS.filter((chapter) => chapter.slug in CHAPTER_SCRIPTS).length;
    await expect(page.getAllByText('Coming soon')).toHaveLength(TUTORIAL_CHAPTERS.length - built);
    await expect(page.getByRole('link', { name: 'Chapter 5: What goes where' })).toHaveAttribute(
      'href',
      '/tutorial/what-goes-where'
    );
    await expect(page.queryByRole('link', { name: /Battle/ })).toBeNull();
  },
});
