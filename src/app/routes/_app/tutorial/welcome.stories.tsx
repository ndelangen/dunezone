import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * Chapter 1, "Welcome", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes as chapter 5's does; see that story.
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
  play: playChapter('Chapter 1: Welcome', 'This is the table'),
});
