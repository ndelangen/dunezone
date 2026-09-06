import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Profiles',
  ...pageStoryMeta,
});

export const Directory = meta.story({ args: { path: '/profiles' } });
/**
 * A contributor page, whose FAQ activity cites rulesets by their covers.
 *
 * The citation carries a cover only because the projection behind it sends the cover fields;
 * before that it fell back to the shared glyph.
 * The shared baseline leaves `image_cover` null, so the seed here is what makes the cover reachable at all.
 */
export const Detail = meta.story({
  args: { path: '/profiles/storybook-viewer' },
  parameters: {
    database: db((baseline) => {
      for (const row of baseline.rulesets) {
        row.image_cover = '/image/texture/021.jpg';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Both FAQ strips cite the ruleset, so both are checked rather than whichever came first. */
    const citations = await page.findAllByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });
    expect(citations.length).toBeGreaterThan(1);
    for (const citation of citations) {
      expect(citation.querySelector('img')).not.toBeNull();
    }
  },
});
export const Settings = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
});

/**
 * Profile settings joins the edit-page pattern (#921): the band is collapsed until the draft carries a warning, and warnings derive live from the schema instead of waiting for a submit.
 *
 * Clearing the display name is the probe because a loaded profile starts valid, so the band's opening can only come from the live derivation.
 * The band's own attribute is what closure is read from, for the reason given on EditResetClosesTheValidationBand in the faction stories.
 * The retype-then-blur close is the settle latch working: an empty warnings list closes the band only on a settle signal, and the form's blur capture is that signal here.
 */
export const SettingsInvalidNameOpensTheBand = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
  parameters: {
    /* The baseline viewer predates the schema floors (hyphenated username, no avatar), which would
       open the band at load and leave this story probing the seed instead of the derivation.
       A valid starting draft is what makes the band's opening attributable to the clear alone. */
    database: db((baseline) => {
      const viewer = baseline.profiles.find((row) => row.slug === 'storybook-viewer');
      if (viewer) {
        viewer.username = 'StorybookViewer';
        viewer.avatar_url = 'https://example.com/avatar.png';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const body = canvasElement.ownerDocument.body;
    const nameField = await page.findByRole('textbox', { name: 'Display name' }, { timeout: 30_000 });
    expect(body.querySelector('[data-page-layout-header-size]')).toBeNull();
    await userEvent.clear(nameField);
    await expect(page.findByText('Needs attention', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(body.querySelector('[data-page-layout-header-size]')).not.toBeNull();
    await userEvent.type(nameField, 'StorybookViewer');
    await userEvent.tab();
    await waitFor(() => expect(body.querySelector('[data-page-layout-header-size]')).toBeNull(), { timeout: 30_000 });
  },
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
