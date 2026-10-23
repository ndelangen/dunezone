import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

import { ImportStoryPage } from './imports.stories.fixture';

const meta = preview.meta({
  title: 'Imports/Import and export',
  component: ImportStoryPage,
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Package JSON' })).toBeNull();
  },
});
