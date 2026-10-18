import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expectFactionColumns } from '@ui/list/factionListPlay';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectFieldValue } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Profiles',
  ...pageStoryMeta,
});

export const Directory = meta.story({
  args: { path: '/profiles' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    await expect(main.findByRole('link', { name: /storybook-viewer/ }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/profiles/storybook-viewer'
    );
  },
});

/** Thirty Fremen beside the viewer, so the directory has more than one page holds. */
function seedFremen(baseline: StorybookDatabase) {
  for (let index = 1; index <= 30; index++) {
    const number = String(index).padStart(2, '0');
    baseline.users.push({ $key: `fremen-${number}`, name: `Fremen ${number}` });
    baseline.profiles.push({
      user_id: ref(`fremen-${number}`),
      username: `Fremen ${number}`,
      slug: `fremen-${number}`,
      avatar_url: null,
      account_state: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  }
}

/** The directory's rows, each named by the profile it opens. */
function profileRows(main: ReturnType<typeof within>, name: RegExp) {
  return main.getAllByRole('link', { name });
}

/** More profiles than one page holds, so the directory pages them and a search narrows them. */
export const DirectoryPagesAndSearch = meta.story({
  args: { path: '/profiles?page=2' },
  parameters: { database: db(seedFremen) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    /* A to Z, the viewer sorts after every Fremen, so page two holds the last seven of the thirty-one. */
    await expect(main.findByRole('link', { name: /Fremen 25/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(main.getByRole('link', { name: /storybook-viewer/ })).toBeVisible();
    await expect(main.queryByRole('link', { name: /Fremen 24/ })).toBeNull();
    await expect(page.getByRole('link', { name: 'First page' })).toHaveAttribute('href', '/profiles');

    await userEvent.type(page.getByRole('textbox', { name: 'Search profiles' }), 'Fremen 07');
    await expect(main.findByRole('link', { name: /Fremen 07/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(main.queryByRole('link', { name: /storybook-viewer/ })).toBeNull());
    /* The search is one short list: no pages and no count. */
    await expect(page.queryByRole('link', { name: 'First page' })).toBeNull();
    await expect(page.queryByText(/of \d+ profiles/)).toBeNull();
  },
});

/**
 * A search shows its best matches and loads more in place: no pages, no count, and the sort is best match alone.
 * An old link's page and order are dropped, so it opens the search's first matches.
 * "Load more" lengthens the list until every match is shown, and hands focus to the first new row.
 */
export const DirectorySearched = meta.story({
  args: { path: '/profiles?q=fremen&page=2&sort=newest' },
  parameters: { database: db(seedFremen) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    const loadMore = await main.findByRole('button', { name: 'Load more' }, { timeout: 30_000 });
    await expect(profileRows(main, /Fremen/)).toHaveLength(24);
    await expect(main.queryByRole('link', { name: /storybook-viewer/ })).toBeNull();
    await expect(page.queryByLabelText('Profile pages')).toBeNull();
    await expect(page.queryByText(/of \d+ profiles/)).toBeNull();
    await expect(page.getByRole('textbox', { name: 'Search profiles' })).toHaveValue('fremen');
    const sort = page.getByRole('combobox', { name: 'Sort' });
    await expect(sort).toHaveValue('Best match');
    await expect(sort).toBeDisabled();

    await userEvent.click(loadMore);
    await waitFor(() => expect(profileRows(main, /Fremen/)).toHaveLength(30), { timeout: 30_000 });
    await expect(profileRows(main, /Fremen/)[24]).toHaveFocus();
    await expect(main.getByRole('status')).toHaveTextContent('More profiles loaded');
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
});
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
    await expect(page.queryByRole('region', { name: 'Sign-in methods' })).toBeNull();
    const citations = await page.findAllByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });
    await expect(citations.length).toBeGreaterThan(1);
    for (const citation of citations) {
      await expect(citation.querySelector('img')).not.toBeNull();
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
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Display name', 'storybook-viewer'),
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
    await expect(page.getByRole('textbox', { name: 'BoardGameGeek profile URL' })).toHaveValue(
      'https://boardgamegeek.com/user/ExamplePlayer'
    );
    await userEvent.click(page.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled());
    await expect(page.getByRole('textbox', { name: 'BoardGameGeek profile URL' })).toHaveValue(
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
    await expect(link).toHaveAttribute('href', 'https://boardgamegeek.com/user/ExamplePlayer');
    await expect(page.getByText('Unverified')).toBeVisible();
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
    await expect(body.querySelector('[data-page-layout-header-size]')).toBeNull();
    await userEvent.clear(nameField);
    await expect(page.findByText('Needs attention', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(body.querySelector('[data-page-layout-header-size]')).not.toBeNull();
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
    await expect(page.queryByRole('button', { name: 'Save profile' })).toBeNull();
  },
});
/** The deletion page once loaded, with its delete control held back until the outcome is acknowledged. */
async function findDeletionPage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Delete account', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await expect(page.findByRole('button', { name: 'Delete account' }, { timeout: 30_000 })).resolves.toBeDisabled();
  return page;
}

export const DeleteAccount = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
  play: async ({ canvasElement }) => {
    const page = await findDeletionPage(canvasElement);
    await expect(page.getByRole('button', { name: 'Choose a replacement owner' })).toBeVisible();
  },
});

/** With nobody to hand ownership to, the page says what will be soft-deleted and still waits for the acknowledgement. */
export const DeleteAccountReplacementPicker = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
  play: async ({ canvasElement }) => {
    const page = await findDeletionPage(canvasElement);
    const ownership = within(page.getByRole('list'));
    for (const kind of ['Groups', 'Factions', 'Rulesets', 'Assets']) {
      await expect(ownership.getByText(new RegExp(`^${kind}: active ownership`))).toBeVisible();
    }
    await userEvent.click(page.getByRole('button', { name: 'Choose a replacement owner' }));
    await waitForFrame(() => page.getByText('No other active profiles are available.'), { timeout: 30_000 });
    await expect(page.getByText('No replacement selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeDisabled();
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
