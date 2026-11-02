import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { expectWithinWidth } from './pagePlay';
import { findTitledPage, titled } from './site.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Site',
  ...pageStoryMeta,
});

/**
 * The most-reached message in the application, and the last one to wear the shared frame.
 * The assertions distinguish the frame from what stood here before, which was a bare paragraph and a raw link under a title with no pane.
 */
export const NotFound = meta.story({
  args: { path: '/a-page-that-does-not-exist' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('heading', { name: 'This page does not exist' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Go back home' }, { timeout: 30_000 });
    await expect(back.closest('main')).toBeNull();
  },
});

export const FuturePlans = meta.story({
  args: { path: '/future-plans' },
  play: titled(/^A map of what Dune Zone could become$/),
});

/** The blog's numbered list of posts, newest first, each title opening its post. */
export const Blog = meta.story({
  args: { path: '/blog' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Why Dune?' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/blog/why-dune'
    );
  },
});

/** One post, "Why Dune?": its title and byline in the band, then a video that loads only when played, photographs, a link to the Dreamrules Workshop mod, and the Dream Rulebook cover to close. */
export const BlogPost = meta.story({
  args: { path: '/blog/why-dune' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { level: 1, name: 'Why Dune?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('button', { name: 'Play MCDM Plays Dune - Round 1' })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Dreamrules TTS mod' })).resolves.toHaveAttribute(
      'href',
      'https://steamcommunity.com/sharedfiles/filedetails/?id=2859509846'
    );
  },
});

export const BlogPostPhone = meta.story({
  args: { path: '/blog/why-dune' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Why Dune\?$/);
    const video = await page.findByRole('button', { name: 'Play MCDM Plays Dune - Round 1' });
    const figures = await page.findAllByRole('figure');
    await expect(figures.length).toBeGreaterThan(1);
    await expectWithinWidth(canvasElement, [video, ...figures]);
  },
});

/** The same page at phone width, where each picture sits above its terms. */
export const GlossaryPhone = meta.story({
  args: { path: '/glossary' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /glossary/i);
    await expect(page.findByRole('heading', { name: 'Troop' }, { timeout: 30_000 })).resolves.toBeVisible();
    const topics = [...canvasElement.ownerDocument.querySelectorAll('section[id^="topic-"]')];
    await expect(topics.length).toBeGreaterThan(1);
    await expectWithinWidth(canvasElement, topics);
  },
});
