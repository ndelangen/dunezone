import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Auth',
  ...pageStoryMeta,
});

export const Login = meta.story({
  args: { path: '/auth/login' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Continue with Reddit' }, { timeout: 30_000 })
    ).resolves.toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue with Discord' })).toBeDisabled();
  },
});
export const OAuthError = meta.story({
  args: { path: '/auth/error?error=oauth_failed' },
  parameters: { identity: null },
});
