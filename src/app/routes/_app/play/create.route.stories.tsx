import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, ref, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';

const signedIn = (isAdmin: boolean) => ({
  identity: { ...storybookViewer, sessionKey: 'create-session' },
  database: db((baseline) => {
    for (const user of baseline.users) {
      user.isAdmin = isAdmin;
    }
    baseline.authSessions.push({
      $key: 'create-session',
      userId: ref(storybookViewer.subjectKey),
      expirationTime: 4_102_444_800_000,
    });
    baseline.authRefreshTokens.push({ sessionId: ref('create-session'), expirationTime: 4_102_444_800_000 });
  }),
});

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Create',
  args: { path: '/play/create' },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Create a game', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/auth/login'
    );
    expect(page.queryByRole('button', { name: 'Create game' })).toBeNull();
  },
});

export const Member = meta.story({
  parameters: signedIn(false),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('You cannot create a game yet', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Create game' })).toBeNull();
  },
});

/** The baseline ruleset links a treachery deck and no spice deck, so the directory objects and creation stays disabled. */
export const Administrator = meta.story({
  parameters: signedIn(true),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const create = await page.findByRole('button', { name: 'Create game' }, { timeout: 30_000 });
    expect(create).toBeDisabled();
    await userEvent.click(page.getByPlaceholderText('Choose a ruleset'));
    await userEvent.click(await page.findByRole('option', { name: 'ClassicRules' }, { timeout: 10_000 }));
    await expect(page.findByRole('status', {}, { timeout: 10_000 })).resolves.toHaveTextContent(
      'No spice deck is linked.'
    );
    expect(page.getByLabelText('Minimum players')).toHaveValue('6');
    expect(create).toBeDisabled();
  },
});
