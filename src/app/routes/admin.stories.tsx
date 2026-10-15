import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Admin',
  ...pageStoryMeta,
});

/** The dashboard for an administrator: the session says so, and only then does the page ask for the admin-only dashboard. */
export const Migrations = meta.story({
  args: { path: '/admin/migrations' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Sync migration status' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

/**
 * The dashboard reached by a reader who is not signed in: the gate frame, not the dashboard.
 * Coverable since the session gate reads `useSessionViewer` and the seam's signed-out answer stopped collapsing into the pending shape (#803).
 */
export const MigrationsSignedOut = meta.story({
  args: { path: '/admin/migrations' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Sync migration status' })).toBeNull();
  },
});

/** The dashboard reached by a signed-in reader without the administrative role. */
export const MigrationsNotAuthorized = meta.story({
  args: { path: '/admin/migrations' },
  parameters: withoutAdmins,
  play: async ({ canvasElement }) => {
    await expectRefused(canvasElement, 'You cannot view migration activity', {
      role: 'button',
      name: 'Sync migration status',
    });
  },
});
