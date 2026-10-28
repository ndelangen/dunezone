import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "Moving pieces", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes from the recorded tutorial setup.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Moving pieces',
  args: { path: '/tutorial/moving-pieces' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 7: Moving pieces', 'Move a troop'),
});

/** The chapter opened at its seventh task with `?step=7`, so the later tasks can be tried without carrying a stack first. */
export const FromTurning = meta.story({
  args: { path: '/tutorial/moving-pieces?step=7' },
  parameters: chapterParameters,
  play: playChapter('Chapter 7: Moving pieces', 'Turn your stack'),
});
