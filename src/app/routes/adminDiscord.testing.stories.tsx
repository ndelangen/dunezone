import { testingPreview } from '@sb/preview';
import { useEffect } from 'react';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';

import { useStorybookDatabaseClient } from '@db/storybook';

import { adminDiscordRecoveryParameters } from './adminDiscord.stories.fixture';
import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
import { voiceParameters } from './discord.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const adminDatabase: { client: ReturnType<typeof useStorybookDatabaseClient> | null } = { client: null };

function ObserveAdminDatabase() {
  const client = useStorybookDatabaseClient();
  useEffect(() => {
    adminDatabase.client = client;
    return () => {
      adminDatabase.client = null;
    };
  }, [client]);
  return null;
}

const meta = testingPreview.meta({
  title: 'Admin/Discord',
  ...pageStoryMeta,
  decorators: [
    (Story) => (
      <>
        <ObserveAdminDatabase />
        <Story />
      </>
    ),
  ],
});

async function expectRecoveryStates(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(page.findByRole('columnheader', { name: /^Cleanup$/ })).resolves.toBeVisible();
  const active = within(page.getByRole('row', { name: /Creation in progress/ }));
  const expired = within(page.getByRole('row', { name: /Creation retry/ }));
  await expect(active.getByText('Creating', { exact: true })).toBeVisible();
  await expect(expired.getByText('Retrying', { exact: true })).toBeVisible();
  for (const state of page.getAllByText(/^(Creating|Retrying|pending|ready)$/)) {
    await expect(state.scrollWidth).toBeLessThanOrEqual(state.clientWidth);
  }
  await expect(expired.getByText('Discord did not confirm channel creation.')).toBeVisible();
  await expect(expired.getByRole('button', { name: 'Retry now for Creation retry' })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await expect(active.getByText(/^Scheduled retry:/)).toHaveTextContent('UTC');
  await expect(page.getByRole('cell', { name: /^Awaiting channel setup$/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^Awaiting channel rename$/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^Hourly, when voice is empty$/ })).toBeVisible();
  await expect(page.queryByText(/Check Discord first/)).toBeNull();
  return page;
}

export const RecoveryStates = meta.story({
  args: { path: '/admin/discord' },
  parameters: adminDiscordRecoveryParameters(),
  play: async ({ canvasElement }) => {
    await expectRecoveryStates(canvasElement);
  },
});

export const RecoveryStatesPhone = meta.story({
  args: { path: '/admin/discord' },
  parameters: adminDiscordRecoveryParameters(),
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = await expectRecoveryStates(canvasElement);
    const table = page.getByRole('columnheader', { name: /^Cleanup$/ }).closest('table')!;
    const scrollport = table.closest<HTMLElement>('[data-scrollarea-viewport]')!;
    await expect(scrollport.clientWidth).toBeLessThan(table.scrollWidth);
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.ownerDocument.defaultView!.innerWidth
    );
  },
});

export const RetryChannel = meta.story({
  args: { path: '/admin/discord' },
  parameters: adminDiscordRecoveryParameters(),
  play: async ({ canvasElement }) => {
    const page = await expectRecoveryStates(canvasElement);
    const mutation = spyOn(adminDatabase.client!, 'mutation');
    const row = within(page.getByRole('row', { name: /Creation in progress/ }));
    await userEvent.click(row.getByRole('button', { name: 'Retry now for Creation in progress' }));
    await waitFor(async () => {
      await expect(mutation).toHaveBeenCalledWith(
        expect.anything(),
        { channelId: expect.any(String) },
        expect.anything()
      );
      await expect(row.getByRole('button', { name: 'Retry now for Creation in progress' })).not.toHaveAttribute(
        'aria-busy',
        'true'
      );
      await expect(row.getByText('Creating', { exact: true })).toBeVisible();
    });
    const toggle = page.getByRole('switch', { name: 'Discord integration' });
    await userEvent.click(toggle);
    await waitFor(async () => {
      await expect(page.getAllByRole('cell', { name: /^Paused$/ })).toHaveLength(6);
      await expect(row.getByRole('button', { name: 'Retry now for Creation in progress' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      await expect(row.getByRole('button', { name: 'Retry now for Creation in progress' })).toHaveAccessibleDescription(
        'Discord integration is disabled.'
      );
    });
  },
});

export const RetryFailure = meta.story({
  args: { path: '/admin/discord' },
  parameters: adminDiscordRecoveryParameters(),
  play: async ({ canvasElement }) => {
    const page = await expectRecoveryStates(canvasElement);
    spyOn(adminDatabase.client!, 'mutation').mockRejectedValueOnce(
      new Error('The channel could not be queued. Try again.')
    );
    await userEvent.click(page.getByRole('button', { name: 'Retry now for Creation retry' }));
    await expect(page.findByRole('alert')).resolves.toHaveTextContent('Channel retry failed');
    await expect(page.getByRole('alert')).toHaveTextContent('The channel could not be queued. Try again.');
  },
});

export const DashboardWiring = meta.story({
  args: { path: '/admin/discord' },
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Tracked channels' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByText('Game invites are shared. Individual Discord access is not tracked.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(page.queryByRole('heading', { name: 'Recent nudge delivery issues' })).not.toBeInTheDocument();
    await expect(page.getByRole('link', { name: '300 (opens in a new tab)' })).toHaveAttribute(
      'href',
      'https://discord.com/channels/100/300'
    );
    await expect(page.getByRole('group', { name: 'Channel pages' })).toBeVisible();
    const toggle = page.getByRole('switch', { name: 'Discord integration' });
    await expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    await expect(page.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Refresh' })).toHaveAccessibleDescription(
      'Discord integration is disabled.'
    );
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
  },
});

export const NotAuthorized = meta.story({
  args: { path: '/admin/discord' },
  parameters: withoutAdmins,
  play: async ({ canvasElement }) => {
    await expectRefused(canvasElement, 'Admin access required', { role: 'button', name: 'Refresh' });
  },
});

export const FinishedGameWaitingForEmptyVoice = meta.story({
  args: { path: '/admin/discord' },
  parameters: voiceParameters(true, true),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Hourly, when voice is empty')).resolves.toBeVisible();
    const toggle = page.getByRole('switch', { name: 'Discord integration' });
    await userEvent.click(toggle);
    await waitFor(async () => {
      await expect(toggle).not.toBeChecked();
      await expect(page.getByRole('cell', { name: 'Paused' })).toBeVisible();
      await expect(page.queryByText('Hourly, when voice is empty')).toBeNull();
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await waitFor(async () => {
      await expect(toggle).toBeChecked();
      await expect(page.getByRole('cell', { name: 'Hourly, when voice is empty' })).toBeVisible();
      await expect(page.queryByRole('cell', { name: 'Paused' })).toBeNull();
    });
  },
});

export const DashboardPhone = meta.story({
  args: { path: '/admin/discord' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const link = await page.findByRole('link', { name: '300 (opens in a new tab)' }, { timeout: 30_000 });
    await expect(link).toHaveAttribute('target', '_blank');
    const table = link.closest('table')!;
    const scrollport = table.closest<HTMLElement>('[data-scrollarea-viewport]')!;
    await expect(scrollport.clientWidth).toBeLessThan(table.scrollWidth);
    await expect(page.getByRole('group', { name: 'Channel pages' })).toBeVisible();
  },
});

export const ExhaustedChannelActions = meta.story({
  args: { path: '/admin/discord' },
  parameters: adminDiscordRecoveryParameters(true),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('heading', { name: 'Tracked channels' });
    for (const name of ['Rename needs attention', 'Deletion needs attention', 'Unconfirmed creation']) {
      const row = within(page.getByRole('row', { name: new RegExp(name) }));
      await expect(row.getByText('Needs attention', { exact: true })).toBeVisible();
      await expect(row.getByRole('button', { name: `Retry now for ${name}` })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      );
    }
    const uncertain = within(page.getByRole('row', { name: /Unconfirmed creation/ }));
    await expect(
      uncertain.getByText('Check Discord for the unconfirmed channel. Retry checks again without creating another.')
    ).toBeVisible();
    await expect(uncertain.getByText('Channel creation is unconfirmed.')).toBeVisible();
    await expect(uncertain.getByRole('cell', { name: 'Manual Discord inspection' })).toBeVisible();
    for (const badge of page.getAllByText('Needs attention', { exact: true })) {
      await expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth);
    }
    const deletion = within(page.getByRole('row', { name: /Deletion needs attention/ }));
    await expect(
      deletion.getByText('Automatic retries stopped. Retry to continue removing this channel.')
    ).toBeVisible();
    await expect(
      deletion.getByRole('button', { name: 'Delete channel for Deletion needs attention' })
    ).toHaveAccessibleDescription('Channel removal stopped. Use Retry to continue.');
    const mutation = spyOn(adminDatabase.client!, 'mutation');
    await userEvent.click(deletion.getByRole('button', { name: 'Retry now for Deletion needs attention' }));
    await waitFor(() => expect(mutation).toHaveBeenCalled());
  },
});
