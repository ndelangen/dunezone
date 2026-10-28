import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

/*
 * "Welcome", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes from the recorded tutorial setup.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Welcome',
  args: { path: '/tutorial/welcome' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const rail = await page.findByRole('banner', { name: 'Chapter 1: Welcome' }, { timeout: 60_000 });
    await expect(await within(rail).findByText('Hear the steps aloud', {}, { timeout: 60_000 })).toBeVisible();
  },
});
