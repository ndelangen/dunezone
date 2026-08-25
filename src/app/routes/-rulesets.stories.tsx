import preview from '@sb/preview';

import { StorybookPage } from './-storybook';
import { pageStoryArgs, pageStoryGlobals, pageStoryParameters } from './-storybookConfig';

const meta = preview.meta({
  title: 'Rulesets',
  component: StorybookPage,
  args: pageStoryArgs,
  parameters: pageStoryParameters,
  globals: pageStoryGlobals,
});

export const Directory = meta.story({ args: { path: '/rulesets', routeKey: 'rulesets' } });
export const Detail = meta.story({ args: { path: '/rulesets/classicrules', routeKey: 'rulesetDetail' } });
export const Edit = meta.story({ args: { path: '/rulesets/classicrules/edit', routeKey: 'rulesetEdit' } });
export const AskQuestion = meta.story({
  args: { path: '/rulesets/classicrules/faq/create', routeKey: 'faqCreate' },
});
export const Question = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move', routeKey: 'faqQuestion' },
});
export const RulebookEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/player-aid/edit', routeKey: 'rulebookEditor' },
  globals: { viewport: { value: 'appAuthoringWide' } },
});
