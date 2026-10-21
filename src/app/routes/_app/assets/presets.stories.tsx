import preview from '@sb/preview';
import { cardbackPresetSchema } from '@shared/assets/cardbackPresets';
import { CARD_FRONT_PUBLICATION_REVISIONS } from '@shared/assets/cardFrontPresets';
import { cardFrontPresetSchema } from '@shared/assets/cardFrontPresets';
import { expect, userEvent, within } from 'storybook/test';

import { db, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import snapshot from './presets-production.stories.fixture.json';

const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Card presets', args: { path: '/assets/__presets' } });
const administratorDatabase = db((baseline) => {
  baseline.users.find((user) => user.$key === storybookViewer.subjectKey)!.isAdmin = true;
  baseline.card_front_presets = snapshot.fronts
    .filter((value) => value.revision > 0)
    .map((value) => {
      const { key, style, revision } = cardFrontPresetSchema.parse(value);
      return { key, style, revision, updated_at: 0 };
    });
  baseline.cardback_presets = snapshot.backs.map((value) => {
    const { key, cardback, revision } = cardbackPresetSchema.parse(value);
    return { key, cardback, revision, updated_at: 0 };
  });
  for (const settings of baseline.admin_settings) {
    if (settings.key === 'publication') {
      Object.assign(settings.renderer_revisions, CARD_FRONT_PUBLICATION_REVISIONS, { 'cardback-preset': 7 });
    }
  }
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
  },
});
export const Library = meta.story({
  parameters: { database: administratorDatabase },
  globals: { backgrounds: { value: 'app', grid: false } },
});
export const Mobile = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appMobileNarrow' } },
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
