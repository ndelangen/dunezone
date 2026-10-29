import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "The private side-table", as its page serves it: House Atreides lays its Kwisatz Haderach card and counter on the private side-table and tracks troops lost,
 * with the rail beside the table giving one task at a time. Its art comes from the recorded tutorial setup.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/The private side-table',
  args: { path: '/tutorial/the-private-side-table' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 18: The private side-table', 'Find your tracking card'),
});
