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
      page.findByRole('button', { name: 'Continue with Google' }, { timeout: 30_000 })
    ).resolves.toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue with Discord' })).toBeDisabled();
    await expect(page.getAllByRole('button', { name: /^Continue with / })).toHaveLength(2);
  },
});
export const LoginAfterUnfinishedSignIn = meta.story({
  args: { path: '/auth/login?redirect=%2Ffactions%2Fcreate&failed=unfinished' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const alert = await page.findByRole('alert', {}, { timeout: 30_000 });
    await expect(alert).toHaveTextContent('You are not signed in');
    await expect(alert).toHaveTextContent('The sign-in did not finish.');
    await expect(
      page.findByRole('button', { name: 'Continue with Google' }, { timeout: 30_000 })
    ).resolves.toBeInTheDocument();
  },
});
/** A failed sign-in lands on the error page, which names the code the provider returned. */
export const OAuthError = meta.story({
  args: { path: '/auth/error?error=oauth_failed' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Sign-in error' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sorry, something went wrong.' })).toBeVisible();
    await expect(page.getByText('Code error: oauth_failed')).toBeVisible();
  },
});
