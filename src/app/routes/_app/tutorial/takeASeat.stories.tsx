import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "Take a seat", as its page serves it: a game in its draft, watched as a spectator, with the rail beside the table
 * giving one task at a time. Its art comes from the recorded tutorial setup.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Take a seat',
  args: { path: '/tutorial/take-a-seat' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 3: Take a seat', 'You are watching'),
});
