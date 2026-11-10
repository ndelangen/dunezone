import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import {
  activeAccount,
  bannedAccount,
  bannedViewer,
  failedBanOperation,
  managedAccountPath,
} from './adminAccount.stories.fixture';
import { withoutAdmins, expectRefused } from './adminPages.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({ title: 'Admin/Account', ...pageStoryMeta });

export const OwnershipAcknowledgement = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: activeAccount },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const ban = await page.findByRole('button', { name: 'Ban account' }, { timeout: 30_000 });
    await expect(ban).toBeDisabled();
    await userEvent.click(page.getByRole('checkbox'));
    await expect(ban).toBeEnabled();
    await userEvent.type(page.getByRole('textbox', { name: 'Admin reason' }), 'Review note');
    await expect(ban).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Choose a replacement owner' }));
    await expect(page.findByRole('searchbox', { name: 'Search profiles' })).resolves.toBeVisible();
    await expect(page.getByText("Choose an active profile to receive this account's content.")).toBeVisible();
    await userEvent.click(await page.findByRole('option', { name: /Central/ }));
    await userEvent.click(page.getByRole('button', { name: 'Use this profile' }));
    await expect(page.getByRole('checkbox', { name: /transfer content to Central/ })).not.toBeChecked();
    await expect(ban).toBeDisabled();
  },
});
export const LiftBan = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: bannedAccount },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Lift ban' }, { timeout: 30_000 }));
    await expect(page.findByRole('button', { name: 'Ban account' })).resolves.toBeDisabled();
    await expect(page.queryByRole('button', { name: 'Lift ban' })).toBeNull();
  },
});
export const MemberRefused = meta.story({
  args: { path: managedAccountPath },
  parameters: withoutAdmins,
  play: async ({ canvasElement }) =>
    expectRefused(canvasElement, 'Admin access required', { role: 'button', name: 'Ban account' }),
});
export const BannedSessionCannotOpenAdmin = meta.story({
  args: { path: '/admin/accounts' },
  parameters: { database: bannedViewer },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'You have been banned' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('navigation')).toBeNull();
    await expect(page.queryByRole('combobox', { name: 'Account status' })).toBeNull();
  },
});
export const BannedSessionCannotOpenTools = meta.story({
  args: { path: '/tools/spice-deck' },
  parameters: { database: bannedViewer },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'You have been banned' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('navigation')).toBeNull();
  },
});

export const FailedContentBlocksUnban = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: failedBanOperation },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Resume content operation' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Lift ban' })).toHaveAttribute('aria-disabled', 'true');
  },
});
export const FindBannedAccount = meta.story({
  args: { path: '/admin/accounts' },
  parameters: { database: bannedAccount },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('combobox', { name: 'Account status' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('option', { name: 'Banned accounts' }));
    await expect(page.findByRole('link', { name: 'Krell' })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('link', { name: 'Manage account' }));
    await expect(page.findByRole('button', { name: 'Lift ban' })).resolves.toBeVisible();
  },
});
