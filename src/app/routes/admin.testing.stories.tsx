import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Admin',
  ...pageStoryMeta,
});

export const ToolsLinks = meta.story({
  args: { path: '/admin' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const accounts = await page.findByRole('link', { name: 'Open accounts' }, { timeout: 30_000 });
    await expect(accounts).toHaveAttribute('href', '/admin/accounts');
    await expect(page.getByRole('link', { name: 'Open card presets' })).toHaveAttribute('href', '/admin/presets');
    await expect(page.getByRole('link', { name: 'Open migration activity' })).toHaveAttribute(
      'href',
      '/admin/migrations'
    );
    await expect(page.getByRole('link', { name: 'Open publication jobs' })).toHaveAttribute('href', '/admin/jobs');
    await expect(page.getByRole('link', { name: 'Open game debugger' })).toHaveAttribute(
      'href',
      '/admin/game-debugger'
    );
  },
});

export const ToolsSignedOut = meta.story({
  args: { path: '/admin' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('link', { name: 'Open accounts' })).toBeNull();
  },
});

export const ToolsNotAuthorized = meta.story({
  args: { path: '/admin' },
  parameters: withoutAdmins,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Admin access required' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('link', { name: 'Open accounts' })).toBeNull();
  },
});

export const LegacyAccountsRedirect = meta.story({
  args: { path: '/_admin/accounts' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Merge profiles' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'All admin tools' })).toHaveAttribute('href', '/admin');
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
    await expectRefused(canvasElement, 'Admin access required', {
      role: 'button',
      name: 'Sync migration status',
    });
  },
});

export const JobsPagination = meta.story({
  args: { path: '/admin/jobs' },
  parameters: {
    database: db((baseline) => {
      const job = baseline.publication_jobs[0]!;
      baseline.publication_jobs = Array.from({ length: 26 }, (_, index) => ({
        ...job,
        asset_id: `queued-asset-${index}`,
        created_at: index,
      }));
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('queued-asset-0', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Next' }));
    await expect(page.findByText('queued-asset-25')).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Previous' }));
    await expect(page.findByText('queued-asset-0')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Next' }));
    await expect(page.findByText('queued-asset-25')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(page.getByRole('option', { name: 'Error' }));
    await expect(page.findByText('No publication jobs match these filters.')).resolves.toBeVisible();
    await expect(page.getByText('Page 1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
  },
});

export const FailedMergeRecovery = meta.story({
  args: { path: '/admin/accounts' },
  parameters: {
    database: db((baseline) => {
      const user = ref('storybook-viewer');
      const profile = ref(baseline.profiles[0]!.$key!);
      baseline.account_merge_operations = Array.from({ length: 41 }, (_, index) => ({
        source_user_id: user,
        target_user_id: user,
        source_profile_id: profile,
        target_profile_id: profile,
        requested_by: user,
        source_name: `Interrupted profile ${index}`,
        target_name: 'Kept profile',
        target_slug: 'kept-profile',
        state: index < 21 ? 'failed' : 'completed',
        phase: 0,
        error: index < 21 ? `Interrupted merge ${index}` : null,
        created_at: index,
        completed_at: null,
      }));
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Failed merges' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getAllByRole('button', { name: 'Retry merge' })).toHaveLength(20);
    await userEvent.click(page.getByRole('button', { name: 'Next failed merges' }));
    await waitFor(() => expect(page.getAllByRole('button', { name: 'Retry merge' })).toHaveLength(1));
    await expect(page.getByRole('button', { name: 'Next failed merges' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Previous failed merges' }));
    await waitFor(() => expect(page.getAllByRole('button', { name: 'Retry merge' })).toHaveLength(20));
  },
});

export const MigrationsPhone = meta.story({
  args: { path: '/admin/migrations' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  parameters: {
    database: db((baseline) => {
      baseline.migration_runs.push({
        migration_id: 'migration_with_a_long_identifier_that_requires_horizontal_scrolling',
        state: 'success',
        is_done: true,
        processed: 42,
        latest_start: 1,
        updated_at: '2026-01-01T12:00:00Z',
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Recorded snapshots' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const document = canvasElement.ownerDocument;
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    for (const table of page.getAllByRole('table')) {
      const scrollport = table.closest<HTMLElement>('[data-scrollarea-viewport]');
      await expect(scrollport).not.toBeNull();
      await expect(scrollport!.scrollWidth).toBeGreaterThan(scrollport!.clientWidth);
    }
  },
});
