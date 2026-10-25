import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * Chapter 10, "The hidden zone", as its page serves it: a card from the hand into the private hidden zone, laid out, and back,
 * with the rail beside the table giving one task at a time. Its art comes as chapter 5's does; see that story.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/The hidden zone',
  args: { path: '/tutorial/the-hidden-zone' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 10: The hidden zone', 'Open your hand'),
});
