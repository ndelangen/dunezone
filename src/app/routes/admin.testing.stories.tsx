import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

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
