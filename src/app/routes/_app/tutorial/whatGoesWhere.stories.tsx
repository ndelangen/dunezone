import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "What goes where", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art is the site's live `/published/...` images: the deployed Storybook
 * forwards them to the site, and a local Storybook serves the copy `bun run tutorial:mirror` makes. Without that copy the cards
 * and tokens are blank; the play below checks the rail and its arrow, not the art. A local server does not forward them, because
 * other stories rely on the same preset paths answering as missing.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/What goes where',
  args: { path: '/tutorial/what-goes-where' },
  globals: chapterGlobals,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 10: What goes where', 'Move on to the Spice Blow'),
});
