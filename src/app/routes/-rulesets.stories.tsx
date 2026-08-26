import preview from '@sb/preview';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Rulesets',
  ...pageStoryMeta,
});

export const Directory = meta.story({ args: { path: '/rulesets' } });
export const Detail = meta.story({ args: { path: '/rulesets/classicrules' } });
export const Edit = meta.story({ args: { path: '/rulesets/classicrules/edit' } });
export const AskQuestion = meta.story({
  args: { path: '/rulesets/classicrules/faq/create' },
});
export const Question = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
});
export const RulebookEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/player-aid/edit' },
  globals: { viewport: { value: 'appAuthoringWide' } },
});
