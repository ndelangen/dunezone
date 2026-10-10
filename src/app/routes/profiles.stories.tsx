import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expectFactionColumns } from '@ui/list/factionListPlay';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

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
    expect(page.queryByRole('region', { name: 'Sign-in methods' })).toBeNull();
    const citations = await page.findAllByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });
    expect(citations.length).toBeGreaterThan(1);
    for (const citation of citations) {
      expect(citation.querySelector('img')).not.toBeNull();
    }
  },
});
/**
 * On a tablet the faction list sits beside the sidebar and is narrower than 30rem, so it shows two columns, though the window is at the tablet step.
 * The list counts its columns from its own width.
 * A list that asked the window would show one column here.
 */
export const DetailTablet = meta.story({
  args: { path: '/profiles/storybook-viewer' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const factions = await page.findByRole('region', { name: 'Factions created' }, { timeout: 30_000 });
    await expectFactionColumns(factions, 2);
  },
});
export const Settings = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
});

export const BoardGameGeekLink = meta.story({
  args: { path: '/profiles/central/edit' },
  parameters: {
    database: db((baseline) => {
      const profile = baseline.profiles.find((row) => row.slug === 'storybook-viewer');
      if (profile) {
        profile.username = 'Central';
        profile.slug = 'central';
        profile.avatar_url =
          'https://dune.zone/user-images/135c0f3ded60c3943f4acb17448c5258a53229f4d6f7f02aab7710610059b0fa.jpg';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const field = await page.findByRole('textbox', { name: 'BoardGameGeek profile URL' }, { timeout: 30_000 });
    await userEvent.type(field, 'https://boardgamegeek.com/user/ExamplePlayer');
    await userEvent.click(page.getByRole('tab', { name: 'Sign-in methods' }));
    await userEvent.click(page.getByRole('tab', { name: 'Profile' }));
    expect(page.getByRole('textbox', { name: 'BoardGameGeek profile URL' })).toHaveValue(
      'https://boardgamegeek.com/user/ExamplePlayer'
    );
    await userEvent.click(page.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled());
    expect(page.getByRole('textbox', { name: 'BoardGameGeek profile URL' })).toHaveValue(
      'https://boardgamegeek.com/user/ExamplePlayer'
    );
  },
});

export const BoardGameGeekProfileLink = meta.story({
  args: { path: '/profiles/storybook-viewer' },
  parameters: {
    database: db((baseline) => {
      const profile = baseline.profiles.find((row) => row.slug === 'storybook-viewer');
      if (profile) {
        profile.bgg_profile_url = 'https://boardgamegeek.com/user/ExamplePlayer';
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const link = await page.findByRole('link', { name: 'View BGG profile' }, { timeout: 30_000 });
    expect(link).toHaveAttribute('href', 'https://boardgamegeek.com/user/ExamplePlayer');
    expect(page.getByText('Unverified')).toBeVisible();
  },
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
    await waitForFrame(() => page.getByText('No other active profiles are available.'), { timeout: 30_000 });
  },
});

export const SignInMethods = meta.story({
  args: { path: '/profiles/central/edit' },
  parameters: {
    database: db((baseline) => {
      /* Central's public profile fields, copied from production on 2026-10-10. */
      const profile = baseline.profiles.find((row) => row.slug === 'storybook-viewer');
      if (profile) {
        profile.username = 'Central';
        profile.slug = 'central';
        profile.avatar_url =
          'https://dune.zone/user-images/135c0f3ded60c3943f4acb17448c5258a53229f4d6f7f02aab7710610059b0fa.jpg';
      }
      baseline.authAccounts.push({
        userId: ref('storybook-viewer'),
        provider: 'google',
        providerAccountId: 'google-story',
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Sign-in methods' }, { timeout: 30_000 }));
    await expect(
      page.findByText('Connected · keep one sign-in method', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: /^Disconnect Google$/ })).toBeDisabled();
    await userEvent.click(page.getByRole('tab', { name: 'Account' }));
    await expect(page.getByRole('link', { name: /^Delete account$/ })).toBeVisible();
  },
});
