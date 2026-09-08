import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db, ref, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Hosted',
  args: { path: '/play/hosted' },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Sign in to join the hosted table.', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('link', { name: /^Sign in$/ })).toHaveAttribute('href', '/auth/login');
    expect(page.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/play');
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(canvasElement.ownerDocument.querySelector('.dune-play-shell')).toBeNull();
  },
});

export const SignedInBeforeProvisioning = meta.story({
  parameters: {
    identity: { ...storybookViewer, sessionKey: 'hosted-session' },
    database: db((baseline) => {
      for (const user of baseline.users) {
        user.isAdmin = false;
      }
      baseline.authSessions.push({
        $key: 'hosted-session',
        userId: ref(storybookViewer.subjectKey),
        expirationTime: 4_102_444_800_000,
      });
      baseline.authRefreshTokens.push({ sessionId: ref('hosted-session'), expirationTime: 4_102_444_800_000 });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('The hosted table is not available yet.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByText('Sign in to join the hosted table.')).toBeNull();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(canvasElement.ownerDocument.querySelector('.dune-play-shell')).toBeNull();
    expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
  },
});
