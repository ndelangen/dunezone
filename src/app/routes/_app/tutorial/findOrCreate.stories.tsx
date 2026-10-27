import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * Chapter 2, "Find or create a game", as its page serves it: the lobby with a room of sample games, then the create page,
 * with the rail beside them giving one task at a time. Nothing reaches Convex: the chapter answers for the pages itself.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Find or create a game',
  args: { path: '/tutorial/find-or-create' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 2: Find or create a game', 'The lobby'),
});
