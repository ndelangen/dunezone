import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { administratorDatabase } from './presets.stories.fixture';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Assets/Card presets',
  args: { path: '/assets/__presets' },
});
export const Families = meta.story({
  parameters: { database: administratorDatabase },
  globals: { backgrounds: { value: 'app', grid: false } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Leader skill' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stronghold' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Homeworld' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Edit Stronghold' }));
    const group = within(page.getByRole('region', { name: 'Stronghold' }));
    await userEvent.click(group.getAllByRole('button', { name: 'Edit shared background' })[0]!);
    const name = group.getByRole('textbox', { name: 'Shared background name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Stronghold standard header');
    await userEvent.click(group.getByRole('button', { name: 'Save and recapture' }));
    await expect(page.findByRole('status')).resolves.toHaveTextContent(
      'Preset saved. Linked artwork updates as captures finish.'
    );
    await userEvent.click(page.getByRole('button', { name: 'Edit Nexus' }));
    const nexus = within(page.getByRole('region', { name: 'Nexus' }));
    const icon = nexus.getByRole('combobox', { name: 'Nexus icon background' });
    await expect(icon).toHaveValue("Each card's faction");
    await userEvent.click(icon);
    await userEvent.click(page.getByRole('option', { name: /^Custom$/ }));
    await expect(nexus.getByRole('region', { name: 'Background builder' })).toBeVisible();
    await userEvent.click(icon);
    await userEvent.click(page.getByRole('option', { name: "Each card's faction" }));
    await expect(nexus.queryByRole('region', { name: 'Background builder' })).not.toBeInTheDocument();
  },
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
