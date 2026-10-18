import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

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
/* The browser remembers the provider it last finished signing in with, so the story plants that memory before the page reads it. */
const lastSignedInWithDiscord = () => {
  localStorage.setItem('dunezone-last-sign-in', 'discord');
  return () => localStorage.removeItem('dunezone-last-sign-in');
};
/** The provider this browser last signed in with says so inside its button, so a returning reader does not start a second account with the other one. */
export const LoginLastUsed = meta.story({
  args: { path: '/auth/login' },
  parameters: { identity: null },
  beforeEach: lastSignedInWithDiscord,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const discord = await page.findByRole('button', { name: /^Continue with Discord/ }, { timeout: 30_000 });
    await expect(discord).toHaveAccessibleName('Continue with Discord Last used');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveAccessibleName(
      'Continue with Google'
    );
  },
});
/** On a phone the hint still fits inside the button, which is why it is a second line rather than a badge beside the arrow. */
export const LoginLastUsedMobile = meta.story({
  args: { path: '/auth/login' },
  parameters: { identity: null },
  globals: { viewport: { value: 'appMobile' } },
  beforeEach: lastSignedInWithDiscord,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const discord = await page.findByRole('button', { name: /^Continue with Discord/ }, { timeout: 30_000 });
    /* The page's words fade in after the band, so the hint is waited for rather than read at once. */
    await waitFor(() => expect(page.getByText('Last used')).toBeVisible(), { timeout: 30_000 });
    await expect(discord.scrollWidth).toBeLessThanOrEqual(discord.clientWidth);
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
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
