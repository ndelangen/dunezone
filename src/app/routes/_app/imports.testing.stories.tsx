import { testingPreview } from '@sb/preview';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { ImportStoryPage } from './imports.stories.fixture';

const meta = testingPreview.meta({
  title: 'Imports/Import and export',
  component: ImportStoryPage,
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
});

export const ReviewedImport = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const json = await page.findByRole('textbox', { name: 'Package JSON' }, { timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'Ruleset address' })).toHaveValue('classicrules');
    await userEvent.click(json);
    await userEvent.paste(
      JSON.stringify({
        format: 'dunezone-package',
        version: 1,
        packageKey: 'story-rulebook',
        items: [
          {
            key: 'teaching-book',
            kind: 'rulebook',
            data: {
              name: 'Imported teaching rules',
              settings: { size: 'a4', design: 'restrained' },
              contents: createRulebookEditorialStarterContents(),
            },
          },
        ],
      })
    );
    await userEvent.click(page.getByRole('button', { name: 'Preview import' }));
    await expect(page.findByText('Imported teaching rules', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Import reviewed content' }));
    await expect(page.findByText(/teaching-book: created,/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Preview import' }));
    await expect(page.findByText('unchanged', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
