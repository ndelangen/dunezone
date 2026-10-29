import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';
import { hmsPublished } from './hms.stories.fixture';

/*
 * "Bring your own pieces", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes from the recorded tutorial setup.
 * The story database publishes the HMS definition captured from the public catalogue.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Bring your own pieces',
  args: { path: '/tutorial/bring-your-own-pieces' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: { ...chapterParameters, database: hmsPublished },
  play: playChapter('Chapter 19: Bring your own pieces', 'Open the shared inventory'),
});
