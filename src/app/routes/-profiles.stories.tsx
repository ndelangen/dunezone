import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Profiles',
  ...pageStoryMeta,
});

export const Directory = meta.story({ args: { path: '/profiles' } });
export const Detail = meta.story({
  args: { path: '/profiles/storybook-viewer' },
});
export const Settings = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
});

/**
 * The settings page reached by a reader who is not signed in: the gate frame, not the form.
 * Coverable since the session gate reads `useSessionViewer` and the seam's signed-out answer stopped collapsing into the pending shape (#803).
 */
export const SettingsSignedOut = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to profiles' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save profile' })).toBeNull();
  },
});
export const DeleteAccount = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
});

export const DeleteAccountReplacementPicker = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose a replacement owner' }, { timeout: 30_000 }));
    await page.findByText('No other active profiles are available.', {}, { timeout: 30_000 });
  },
});
