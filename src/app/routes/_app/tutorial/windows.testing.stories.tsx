import { testingPreview } from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "Panels", as its page serves it: the compass on Space, a panel in the middle, two slots to pin it in,
 * with the rail beside the table giving one task at a time. Its art comes from the recorded tutorial setup.
 */

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Panels',
  args: { path: '/tutorial/windows' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 8: Panels', 'Find your controls'),
});
