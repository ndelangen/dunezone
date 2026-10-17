import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
    const sync = await page.findByRole('button', { name: 'Sync migration status' }, { timeout: 30_000 });
    const [live, recorded] = page.getAllByRole('table').map((table) => within(table));
    const headers = (table: typeof live) => table!.getAllByRole('columnheader').map((header) => header.textContent);
    await expect(headers(live)).toEqual(['Migration', 'State', 'Done', 'Processed', 'Started', 'Ended', 'Error']);
    await expect(headers(recorded)).toEqual(['Migration ID', 'State', 'Done', 'Processed', 'Updated', 'Error']);
    /*
     * The button holds disabled while the mutation is in flight, so seeing it disabled and then enabled again proves the sync ran and settled.
     * The Storybook backend runs no migrations, so both tables stay empty and no row can show the result.
     */
    await userEvent.click(sync);
    await waitFor(() => expect(sync).toBeDisabled());
    await waitFor(() => expect(sync).toBeEnabled());
    await expect(page.getAllByRole('table')).toHaveLength(2);
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
