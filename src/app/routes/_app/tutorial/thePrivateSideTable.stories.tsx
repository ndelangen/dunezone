import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * Chapter 10, "The private side-table", as its page serves it: a card from the hand onto the private side-table, laid out, turned and back,
 * with the rail beside the table giving one task at a time. Its art comes as chapter 5's does; see that story.
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
  play: playChapter('Chapter 10: The private side-table', 'Open your hand'),
});
