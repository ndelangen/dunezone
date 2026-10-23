import { testingPreview } from '@sb/preview';
import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { asset, db } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({ title: 'Assets/Leader token', ...pageStoryMeta });

export const CreateSaves = meta.story({
  args: { path: '/assets/token-leader/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 }), 'Independent leader');
    await userEvent.type(page.getByRole('textbox', { name: 'Strength' }), '6');
    await expect(page.queryByRole('tab', { name: 'Back' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Save token' }));
    await expect(page.findByRole('button', { name: 'Delete token' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Independent leader');
    await expect(page.getByRole('textbox', { name: 'Strength' })).toHaveValue('6');
  },
});

export const EditResetSave = meta.story({
  args: { path: '/assets/token-leader/duke-prad-vidal/edit' },
  parameters: {
    database: db((baseline) => {
      baseline.assets.push(asset({ type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN }));
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 })).resolves.toHaveValue(
      'Duke Prad Vidal'
    );
    const strength = page.getByRole('textbox', { name: 'Strength' });
    await expect(strength).toHaveValue('6');
    await userEvent.clear(strength);
    await userEvent.type(strength, 'X');
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(strength).toHaveValue('6');
    await userEvent.clear(strength);
    await userEvent.type(strength, '7');
    await userEvent.click(page.getByRole('button', { name: 'Save token' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Reset unsaved edits' })).toBeDisabled());
    await expect(strength).toHaveValue('7');
  },
});

export const LoadApprovedPreset = meta.story({
  args: { path: '/assets/token-leader/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load existing token' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('button', { name: 'Duke Prad Vidal' }));
    await userEvent.click(page.getByRole('button', { name: /^Load token$/u }));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Duke Prad Vidal');
    await expect(page.getByRole('textbox', { name: 'Strength' })).toHaveValue('6');
    await expect(page.getByRole('button', { name: 'Save token' })).toBeEnabled();
  },
});
