import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { CREATOR_PARTS, CREATOR_TUTORIALS } from '../create/creatorTutorials';
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
    await expect(page.queryAllByText('Coming soon')).toHaveLength(TUTORIAL_CHAPTERS.length - built);
    await expect(page.getByRole('link', { name: 'Chapter 11: What goes where' })).toHaveAttribute(
      'href',
      '/tutorial/what-goes-where'
    );
    const unbuilt = TUTORIAL_CHAPTERS.find((chapter) => !(chapter.slug in CHAPTER_SCRIPTS));
    if (unbuilt) {
      await expect(page.queryByRole('link', { name: new RegExp(unbuilt.title) })).toBeNull();
    }
  },
});

/** The Creating content catalogue at /create: the creator tutorials as tiles, the faction tutorial built and the rest coming soon. */
export const Creating = meta.story({
  args: { path: '/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Learn to create', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    for (const part of CREATOR_PARTS) {
      await expect(page.getByRole('list', { name: part })).toBeVisible();
    }
    await expect(page.getAllByRole('listitem')).toHaveLength(CREATOR_TUTORIALS.length);
    const built = CREATOR_TUTORIALS.filter((tutorial) => tutorial.page).length;
    await expect(page.queryAllByText('Coming soon')).toHaveLength(CREATOR_TUTORIALS.length - built);
    await expect(page.getByRole('link', { name: 'Chapter 1: Create a faction' })).toHaveAttribute(
      'href',
      '/create/faction'
    );
    /* The page toolbar moves between the two catalogues. */
    await expect(page.getByRole('link', { name: 'Playing Dune' })).toHaveAttribute('href', '/tutorial');
    await expect(page.getByRole('link', { name: 'Creating content' })).toHaveAttribute('href', '/create');
  },
});
