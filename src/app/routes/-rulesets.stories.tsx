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
/**
 * The same page reached through a ruleset slug that names nothing, which is the state the route's own frame exists for.
 * Its loader throws rather than returning nothing, so without that frame this path falls to the router's default and renders the error unstyled.
 */
export const AskQuestionMissingRuleset = meta.story({
  args: { path: '/rulesets/there-is-no-such-ruleset/faq/create' },
});
export const Question = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
});
export const RulebookEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/player-aid/edit' },
  globals: { viewport: { value: 'appAuthoringWide' } },
});
