import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

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
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Ask a question' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* Not merely that something rendered: the router's default renders too, and without the route's
       own frame this page shows its unstyled block with no way out. The alert's own title and a way
       back that lives in the band are what only the frame produces. */
    await expect(page.findByText('This ruleset could not be loaded', {}, { timeout: 30_000 })).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Back to rulesets' }, { timeout: 30_000 });
    expect(back.closest('main')).toBeNull();
  },
});
export const Question = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
});
export const RulebookEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/player-aid/edit' },
  globals: { viewport: { value: 'appAuthoringWide' } },
});
