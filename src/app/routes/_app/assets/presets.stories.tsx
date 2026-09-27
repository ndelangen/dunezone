import preview from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import { expect, userEvent, within } from 'storybook/test';

import { db, storybookViewer } from '@db/storybook';

import { expectToolbarStatusesOnOneLine } from '../../authoringToolbarPlay';
import { pageStoryMeta } from '../../storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Assets/Card-back presets',
  args: { path: '/assets/__presets' },
});

/* The administrator who may edit presets, with the stock presets published once. */
const administratorDatabase = db((baseline) => {
  baseline.users.find((user) => user.$key === storybookViewer.subjectKey)!.isAdmin = true;
  baseline.cardback_presets = INITIAL_CARDBACK_PRESETS.map(({ key, cardback }) => ({
    key,
    cardback,
    revision: 1,
    updated_at: 0,
  }));
  const settings = baseline.admin_settings[0];
  if (settings) {
    settings.renderer_revisions['cardback-preset'] = 1;
  } else {
    baseline.admin_settings.push({
      key: 'publication',
      publication_pickup_enabled: false,
      renderer_revisions: { 'cardback-preset': 1 },
      updated_at: 0,
    });
  }
});

export const Administrator = meta.story({
  parameters: {
    database: administratorDatabase,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const label = await page.findByRole('textbox', { name: 'Label' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('radio', { name: 'Custom' }));
    await expect(page.getByRole('region', { name: 'Background builder' })).toBeVisible();
    await userEvent.click(page.getByRole('radio', { name: 'Defense' }));
    await expect(page.getByRole('radio', { name: 'Defense' })).toBeChecked();
    await expect(page.queryByRole('region', { name: 'Background builder' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('radio', { name: 'Custom' }));
    await userEvent.click(page.getByRole('button', { name: 'Edit base color layer' }));
    await userEvent.click(await page.findByRole('radio', { name: 'Linear' }));
    const angle = page.getByRole('textbox', { name: 'Gradient angle' });
    await userEvent.clear(angle);
    await userEvent.type(angle, '37');
    await userEvent.click(page.getByRole('radio', { name: 'Solid' }));
    await userEvent.click(await page.findByRole('radio', { name: 'Linear' }));
    await expect(page.getByRole('textbox', { name: 'Gradient angle' })).toHaveValue('37°');
    await userEvent.clear(label);
    await userEvent.type(label, 'Shared Treachery');
    await userEvent.click(page.getByRole('button', { name: 'Save and publish' }));
    await expect(
      page.findByText('Preset saved. Linked decks update when publication finishes.')
    ).resolves.toBeVisible();
  },
});
export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('to edit card-back presets.', { exact: false }, { timeout: 30_000 })
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
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Administrator access required' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

/** The preset editor's toolbar on one line at a phone, tablet, laptop and desktop width (#1423), stating only its save state at rest. */
export const ToolbarAt360 = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: true }),
});
export const ToolbarAt390 = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: true }),
});
export const ToolbarAt768 = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: false }),
});
export const ToolbarAt1100 = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: false }),
});
export const ToolbarAt1440 = meta.story({
  parameters: { database: administratorDatabase },
  globals: { viewport: { value: 'appLarge' } },
  play: async ({ canvasElement }) =>
    await expectToolbarStatusesOnOneLine(canvasElement, { statuses: ['No unsaved changes'], folded: false }),
});
