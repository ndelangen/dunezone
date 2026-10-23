import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

import { CreateRulesetStoryPage } from './create.stories.fixture';

const meta = preview.meta({
  title: 'Rulesets/Create',
  component: CreateRulesetStoryPage,
  parameters: {
    layout: 'fullscreen',
    database: db((baseline) => baseline),
  },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Create ruleset' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* The gate frame, not the form: the settled signed-out answer must not leave the editor up. */
    await expect(page.queryByRole('textbox', { name: 'Name' })).toBeNull();
  },
});
