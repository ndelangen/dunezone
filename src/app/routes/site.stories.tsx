import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Site',
  ...pageStoryMeta,
});

/**
 * The most-reached message in the application, and the last one to wear the shared frame.
 * The assertions distinguish the frame from what stood here before, which was a bare paragraph and a raw link under a title with no pane.
 */
export const NotFound = meta.story({
  args: { path: '/a-page-that-does-not-exist' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('heading', { name: 'This page does not exist' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Go back home' }, { timeout: 30_000 });
    expect(back.closest('main')).toBeNull();
  },
});
export const Icons = meta.story({ args: { path: '/__icons' } });
export const PublicationJobs = meta.story({ args: { path: '/_admin/jobs' } });

/** The job queue reached by a reader the server does not recognise, which is a login gate rather than an alert inside a dashboard header. */
export const PublicationJobsSignedOut = meta.story({
  args: { path: '/_admin/jobs' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* The dashboard's own header, with its briefcase and its description, is what the frame replaces. */
    await expect(
      page.queryByText(
        'Inspect the durable work queue and control whether the next scheduled run may pick up pending work.'
      )
    ).toBeNull();
  },
});
export const FuturePlans = meta.story({ args: { path: '/future-plans' } });
export const Privacy = meta.story({ args: { path: '/privacy' } });

/** The hard-coded glossary: one Section per topic with a picture, every term reachable by its anchor and found by the word it replaces. */
export const Glossary = meta.story({
  args: { path: '/glossary' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Troop' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(canvasElement.ownerDocument.getElementById('battle')).not.toBeNull();
    await userEvent.type(page.getByRole('textbox', { name: 'Search the glossary' }), 'combat');
    await expect(page.findByRole('heading', { name: 'Battle', level: 3 })).resolves.toBeVisible();
    expect(page.queryByRole('heading', { name: 'Troop' })).toBeNull();
  },
});

/** The same page at phone width, where each picture sits above its terms. */
export const GlossaryPhone = meta.story({
  args: { path: '/glossary' },
  globals: { viewport: { value: 'appMobile' } },
});

export const Accounts = meta.story({
  args: { path: '/_admin/accounts' },
  parameters: {
    database: db((baseline) => {
      baseline.users.push({ $key: 'other-account', name: 'Discord player' });
      baseline.profiles.push({
        $key: 'other-profile',
        user_id: ref('other-account'),
        username: 'Discord player',
        slug: 'discord-player',
        avatar_url: null,
        account_state: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
      baseline.authAccounts.push(
        { userId: ref('other-account'), provider: 'discord', providerAccountId: 'discord-story' },
        { userId: ref('storybook-viewer'), provider: 'google', providerAccountId: 'google-story' }
      );
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('combobox', { name: 'Profile to keep' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: 'storybook-viewer · storybook-viewer' }));
    await userEvent.click(page.getByRole('combobox', { name: 'Profile to merge into it' }));
    await userEvent.click(await page.findByRole('option', { name: 'Discord player · discord-player' }));
    await userEvent.click(page.getByRole('button', { name: 'Review merge' }));
    await expect(page.findByRole('button', { name: 'Merge into storybook-viewer' })).resolves.toBeVisible();
    await expect(page.getByText('This merge cannot be undone. The other profile will be signed out.')).toBeVisible();
  },
});
export const AccountsSignedOut = meta.story({ args: { path: '/_admin/accounts' }, parameters: { identity: null } });
