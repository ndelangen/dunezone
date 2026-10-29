import preview from '@sb/preview';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Mentat recall',
  args: { path: '/tutorial/mentat-recall' },
  globals: chapterGlobals,
});

export const Chapter = meta.story({
  parameters: chapterParameters,
  play: playChapter('Chapter 20: Mentat recall', 'Look back together'),
});
