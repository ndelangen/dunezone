import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Admin',
  ...pageStoryMeta,
});

export const Migrations = meta.story({ args: { path: '/admin/migrations' } });

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
    expect(page.queryByRole('button', { name: 'Sync migration status' })).toBeNull();
  },
});
