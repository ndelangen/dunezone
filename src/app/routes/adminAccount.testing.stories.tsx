import { useAuthActions } from '@convex-dev/auth/react';
import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { createMemoryHistory } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { expect, fn, mocked, userEvent, within } from 'storybook/test';

import {
  activeAccount,
  bannedAccount,
  bannedViewer,
  failedBanOperation,
  managedAccountPath,
  pendingDiscordDeletion,
} from './adminAccount.stories.fixture';
import { withoutAdmins, expectRefused } from './adminPages.stories.fixture';
import { StorybookPage } from './storybook';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({ title: 'Admin/Account', ...pageStoryMeta });

export const OwnershipAcknowledgement = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: activeAccount },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const ban = await page.findByRole('button', { name: 'Ban account' });
    await expect(ban).toBeDisabled();
    await userEvent.click(page.getByRole('checkbox'));
    await expect(ban).toBeEnabled();
    await userEvent.type(page.getByRole('textbox', { name: 'Admin reason' }), 'Review note');
    await expect(ban).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Choose a replacement owner' }));
    await waitForFrame(() =>
      expect(finishTransitions(page.getByRole('searchbox', { name: 'Search profiles' }))).toBeVisible()
    );
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
    await userEvent.click(await page.findByRole('button', { name: 'Lift ban' }));
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
async function expectBannedPage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(page.findByRole('heading', { name: 'You have been banned' })).resolves.toBeVisible();
  await expect(page.queryByRole('navigation')).toBeNull();
}

export const BannedSessionCannotOpenAdmin = meta.story({
  args: { path: '/admin/accounts' },
  parameters: { database: bannedViewer },
  play: async ({ canvasElement }) => {
    await expectBannedPage(canvasElement);
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('combobox', { name: 'Account status' })
    ).toBeNull();
  },
});
export const BannedSessionCannotOpenTools = meta.story({
  args: { path: '/tools/spice-deck' },
  parameters: { database: bannedViewer },
  play: ({ canvasElement }) => expectBannedPage(canvasElement),
});

export const BannedSessionIsSignedOut = meta.story({
  args: { path: '/admin/accounts' },
  parameters: { database: bannedViewer },
  beforeEach: () => {
    const auth = mocked(useAuthActions);
    auth.mockReturnValue({ signIn: fn(), signOut: fn(async () => {}) });
    return () => {
      auth.mockRestore();
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'You have been banned' })).resolves.toBeVisible();
    await waitForFrame(() => expect(mocked(useAuthActions).mock.results.at(-1)?.value.signOut).toHaveBeenCalledOnce());
  },
});

export const FailedContentBlocksUnban = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: failedBanOperation },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Resume content operation' })).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Lift ban' })).toHaveAttribute('aria-disabled', 'true');
  },
});
export const FindBannedAccount = meta.story({
  args: { path: '/admin/accounts' },
  loaders: [() => ({ accountHistory: createMemoryHistory({ initialEntries: ['/admin/accounts'] }) })],
  render: (args, { loaded }) => <StorybookPage {...args} history={loaded.accountHistory as RouterHistory} />,
  parameters: { database: bannedAccount },
  play: async ({ canvasElement, loaded }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('combobox', { name: 'Account status' }));
    await userEvent.click(page.getByRole('option', { name: 'Banned accounts' }));
    await expect(page.findByRole('link', { name: 'Krell' })).resolves.toBeVisible();
    const manage = page.getByRole('link', { name: 'Manage account' });
    await expect(manage).toHaveAttribute('href', managedAccountPath);
    /* Storybook's Link mock suppresses navigation; the verified destination enters the real memory router. */
    (loaded.accountHistory as RouterHistory).push(manage.getAttribute('href')!);
    await expect(page.findByRole('button', { name: 'Lift ban' })).resolves.toBeVisible();
  },
});

export const ContentFinishedDiscordPending = meta.story({
  args: { path: managedAccountPath },
  parameters: { database: pendingDiscordDeletion },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Content operation completed')).resolves.toBeVisible();
    await expect(page.getByText(/Discord channel deletion is still pending/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Discord voice administration' })).toHaveAttribute(
      'href',
      '/admin/discord'
    );
    await expect(page.queryByText('Discord channels deleted.')).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Lift ban' }));
    await expect(page.findByRole('button', { name: 'Ban account' })).resolves.toBeDisabled();
    await expect(page.getByText(/Discord channel deletion is still pending/)).toBeVisible();
  },
});

export const ReplacementPickerPhone = meta.story({
  args: { path: managedAccountPath },
  globals: { viewport: { value: 'appMobile' } },
  parameters: { database: activeAccount },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose a replacement owner' }));
    const picker = await page.findByRole('dialog');
    await waitForFrame(async () => {
      await expect(finishTransitions(picker)).toBeVisible();
      const bounds = picker.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(0);
      await expect(bounds.right).toBeLessThanOrEqual(canvasElement.ownerDocument.defaultView!.innerWidth);
      await expect(picker.scrollWidth).toBeLessThanOrEqual(picker.clientWidth);
      const action = within(picker).getByRole('button', { name: 'Use this profile' }).getBoundingClientRect();
      await expect(action.left).toBeGreaterThanOrEqual(bounds.left);
      await expect(action.right).toBeLessThanOrEqual(bounds.right);
    });
  },
});
