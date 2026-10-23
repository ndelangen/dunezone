import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { seedPresets, administratorDatabase } from './presets.stories.fixture';

const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Card presets', args: { path: '/assets/__presets' } });
export const Setup = meta.story({
  parameters: {
    database: db((baseline) => {
      seedPresets(baseline);
      baseline.background_presets = [];
    }),
  },
  globals: { backgrounds: { value: 'app', grid: false } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const action = await page.findByRole('button', { name: 'Import DB designs and recapture' }, { timeout: 30_000 });
    await userEvent.click(action);
    await expect(page.findByRole('heading', { name: 'Leader skill' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hiereg Discovery' })).toBeVisible();
  },
});
export const Library = meta.story({
  parameters: { database: administratorDatabase },
  globals: { backgrounds: { value: 'app', grid: false } },
});
export const Mobile = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appMobileNarrow' }, backgrounds: { value: 'app', grid: false } },
});
export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).findByText('to edit presets.', { exact: false }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});
export const NotAdministrator = meta.story({
  parameters: {
    database: db((baseline) => {
      baseline.users.find((user) => user.$key === storybookViewer.subjectKey)!.isAdmin = false;
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).findByRole(
        'heading',
        { name: 'Administrator access required' },
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
  },
});
