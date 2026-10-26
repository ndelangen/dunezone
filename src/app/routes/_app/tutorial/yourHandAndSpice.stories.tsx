import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * Chapter 10, "Your hand and spice", as its page serves it: a card into the hand and back onto the table, and spice out of the reserve,
 * with the rail beside the table giving one task at a time. Its art comes as chapter 5's does; see that story.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Your hand and spice',
  args: { path: '/tutorial/your-hand-and-spice' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 10: Your hand and spice', 'Lay a Spice card on the table'),
});
