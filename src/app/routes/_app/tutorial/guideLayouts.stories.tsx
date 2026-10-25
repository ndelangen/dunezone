import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * The guide as a rail down the left of the window, in the three layouts being compared (Norbert, 2026-10-25: move the band to the left;
 * testers read the board and the arrow, not the small text, and the long arrow looked comical). Each plays the New controls play-test
 * chapter, the one the testers saw, so the layouts can be tried against the same tasks.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Guide layouts',
  globals: chapterGlobals,
});

const band = 'Play-test: New controls';
const first = 'Open the controls';

/** A: the task alone, in large type, with a short arrow at the part carrying the task's number. */
export const TaskCard = meta.story({
  args: { path: '/tutorial/new-controls?guide=card' },
  parameters: chapterParameters,
  play: playChapter(band, first),
});

/** B: every task listed, the open one large with where to find it, and the same short arrow. */
export const Checklist = meta.story({
  args: { path: '/tutorial/new-controls?guide=list' },
  parameters: chapterParameters,
  play: playChapter(band, first),
});

/** C: the same list, with a breathing ring round the part instead of an arrow. */
export const ChecklistRing = meta.story({
  args: { path: '/tutorial/new-controls?guide=ring' },
  parameters: chapterParameters,
  play: playChapter(band, first),
});

/** C on a table task, to see the marker on the board rather than on a control. */
export const RingOnTheTable = meta.story({
  args: { path: '/tutorial/moving-pieces?guide=ring' },
  parameters: chapterParameters,
  play: playChapter('Chapter 7: Moving pieces', 'Split three troops off'),
});

/** A on a table task. */
export const CardOnTheTable = meta.story({
  args: { path: '/tutorial/moving-pieces?guide=card' },
  parameters: chapterParameters,
  play: playChapter('Chapter 7: Moving pieces', 'Split three troops off'),
});
