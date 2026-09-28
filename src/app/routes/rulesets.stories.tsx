import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, ruleset } from '@db/storybook';

import { expectToolbarStatusesOnOneLine } from './authoringToolbarPlay';
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

/** The ruleset editor's toolbar on one line at a phone, tablet, laptop and desktop width (#1423), stating only its save state at rest. */
export const EditToolbarAt360 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: true }),
});
export const EditToolbarAt390 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: true }),
});
export const EditToolbarAt768 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: false }),
});
export const EditToolbarAt1100 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: false }),
});
export const EditToolbarAt1440 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: false }),
});

/**
 * The ruleset editor states only the latest save's failure, in the form and in the toolbar (CodeRabbit on #1435).
 * The first save fails at the update, because another ruleset already has the name.
 * The second stops earlier, at the cover, because Storybook's Convex mock rejects every action.
 * The update's failure from the first save must not stay on the page beside the cover's.
 */
export const EditShowsOnlyTheLatestSaveFailure = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appLarge' } },
  parameters: {
    database: db((baseline) => {
      baseline.rulesets.push(ruleset({ name: 'Advanced Rules' }));
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const toolbarStatus = async () => within(await page.findByRole('group', { name: 'Status' }, { timeout: 30_000 }));
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.clear(name);
    await userEvent.type(name, 'Advanced Rules');
    await userEvent.click(page.getByRole('button', { name: 'Save ruleset' }));
    await expect(page.findByText('Ruleset could not be saved', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      (await toolbarStatus()).findByRole('img', { name: /Ruleset name already exists/ }, { timeout: 30_000 })
    ).resolves.toBeVisible();

    await userEvent.type(page.getByRole('textbox', { name: 'Cover image URL' }), 'https://example.com/cover.png');
    await userEvent.click(page.getByRole('button', { name: 'Save ruleset' }));
    await expect(page.findByText('Cover could not be stored', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      (await toolbarStatus()).findByRole('img', { name: 'The cover could not be stored' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByText('Ruleset could not be saved')).toBeNull();
    expect((await toolbarStatus()).queryByRole('img', { name: /Ruleset name already exists/ })).toBeNull();
  },
});
