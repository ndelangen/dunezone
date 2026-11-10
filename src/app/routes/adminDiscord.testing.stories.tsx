import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { voiceParameters } from './_app/play/voice.stories.fixture';
import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
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
    await expect(page.getByRole('link', { name: '300' })).toHaveAttribute(
      'href',
      'https://discord.com/channels/100/300'
    );
    const toggle = page.getByRole('switch', { name: 'Discord integration' });
    await expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
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
