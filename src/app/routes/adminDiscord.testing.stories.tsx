import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
import { voiceParameters } from './discord.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Admin/Discord',
  ...pageStoryMeta,
});

export const DashboardWiring = meta.story({
  args: { path: '/admin/discord' },
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Tracked channels' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByText('Game invites are shared. Individual Discord access is not tracked.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
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
  parameters: voiceParameters(true, false, true),
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
