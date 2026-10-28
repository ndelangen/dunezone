import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Create your own game',
  args: { path: '/tutorial/create-a-game' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 2: Create your own game', 'Choose a ruleset'),
});
