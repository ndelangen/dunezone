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
    /* The real worker can settle before userEvent.click returns. Record both attribute changes
     * before clicking, so even a completed sync must prove it disabled the button while pending.
     * oldValue identifies each transition even when both arrive in one observer callback. */
    const disabledStates: boolean[] = [];
    const observer = new MutationObserver((records) => {
      disabledStates.push(...records.map((record) => record.oldValue === null));
    });
    observer.observe(sync, { attributes: true, attributeFilter: ['disabled'], attributeOldValue: true });
    try {
      await userEvent.click(sync);
      await waitFor(() => expect(sync).toBeEnabled());
      await waitFor(() => expect(disabledStates).toEqual([true, false]));
    } finally {
      observer.disconnect();
    }
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
