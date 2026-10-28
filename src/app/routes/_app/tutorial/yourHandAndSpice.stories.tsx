import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "Your hand and spice", as its page serves it: a card into the hand and back onto the table, and spice out of the reserve,
 * with the rail beside the table giving one task at a time. Its art comes from the recorded tutorial setup.
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
  play: playChapter('Chapter 9: Your hand and spice', 'Take a card from the deck'),
});
