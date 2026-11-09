import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { install } from '@sinonjs/fake-timers';
import { HOLD_SECONDS } from '@ui/control/useHoldToConfirm';
import { expectFactionColumns } from '@ui/list/factionListPlay';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, faction, STORYBOOK_NOW, storybookViewer } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { strangerOwnsTheGroups, viewerStandsAs } from './groups.stories.fixture';
import { findDeletionPage, seedLeaderboards } from './profiles.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Profiles',
  ...pageStoryMeta,
});

export const BoardGameGeekLink = meta.story({
  args: { path: '/profiles/central/edit' },
  parameters: {
    database: db((baseline) => {
      const profile = baseline.profiles.find((row) => row.slug === 'central');
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

/**
 * Profile settings joins the edit-page pattern (#921): the band is collapsed until the draft carries a warning, and warnings derive live from the schema instead of waiting for a submit.
 *
 * Clearing the display name is the probe because a loaded profile starts valid, so the band's opening can only come from the live derivation.
 * The band's own attribute is what closure is read from, for the reason given on EditResetClosesTheValidationBand in the faction stories.
 * The retype-then-blur close is the settle latch working: an empty warnings list closes the band only on a settle signal, and the form's blur capture is that signal here.
 */
export const SettingsInvalidNameOpensTheBand = meta.story({
  args: { path: '/profiles/central/edit' },
  parameters: {
    /* The baseline viewer predates the schema floors (hyphenated username, no avatar), which would
       open the band at load and leave this story probing the seed instead of the derivation.
       A valid starting draft is what makes the band's opening attributable to the clear alone. */
    database: db((baseline) => {
      const viewer = baseline.profiles.find((row) => row.slug === 'central');
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

/** With nobody sharing a Group to hand ownership to, the page says so, says what will be soft-deleted, and still waits for the acknowledgement. */
export const DeleteAccountReplacementPicker = meta.story({
  args: { path: '/profiles/central/delete' },
  play: async ({ canvasElement }) => {
    const page = await findDeletionPage(canvasElement);
    const ownership = within(page.getByRole('list'));
    for (const kind of ['Groups', 'Factions', 'Rulesets', 'Assets']) {
      await expect(ownership.getByText(new RegExp(`^${kind}: active ownership`))).toBeVisible();
    }
    await userEvent.click(page.getByRole('button', { name: 'Choose a replacement owner' }));
    await waitForFrame(() => page.getByText(/^Nobody shares a group with you yet/), { timeout: 30_000 });
    /* The pane is still fading in when its empty state first exists, so the hint is awaited rather than asserted at once. */
    await waitFor(
      () =>
        expect(
          page.getByText('Only people who share a group with you can receive your direct ownership.')
        ).toBeVisible(),
      { timeout: 30_000 }
    );
    await expect(page.getByText('No replacement selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeDisabled();
  },
});

/** The viewer with Google connected and Discord not, as the Sign-in methods tab shows them. */
function googleConnected(baseline: StorybookDatabase) {
  /* Central's public profile fields, copied from production on 2026-10-10. */
  const profile = baseline.profiles.find((row) => row.slug === 'central');
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
}

/**
 * The invitations waiting on the viewer sit on their own profile, where accepting one moves the Group into their list.
 * Only the viewer sees the card: the public page carries no invitations, since the invited have agreed to nothing yet.
 */
export const DetailOwnInvitationAccepted = meta.story({
  args: { path: '/profiles/central' },
  parameters: {
    database: db((baseline) => {
      strangerOwnsTheGroups(baseline);
      viewerStandsAs(baseline, 'invited');
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const invitations = within(await page.findByRole('region', { name: 'Invitations' }, { timeout: 30_000 }));
    await expect(invitations.getByRole('link', { name: 'Arrakeen Rules Council' })).toBeVisible();
    await expect(invitations.getByText(/^Invited by reverend-mother/)).toBeVisible();
    const groups = within(page.getByRole('region', { name: 'Groups' }));
    await expect(groups.getByText('Not a member of any groups.')).toBeVisible();
    await userEvent.click(invitations.getByRole('button', { name: 'Accept invitation to Arrakeen Rules Council' }));
    await expect(
      groups.findByRole('link', { name: 'Arrakeen Rules Council' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(() => expect(page.queryByRole('region', { name: 'Invitations' })).toBeNull(), { timeout: 30_000 });
  },
});

export const SignInMethods = meta.story({
  args: { path: '/profiles/central/edit' },
  parameters: { database: db(googleConnected) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: 'Sign-in methods' }, { timeout: 30_000 }));
    await expect(
      page.findByText('Connected · keep one sign-in method', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: /^Disconnect Google$/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign out on all devices' })).toBeEnabled();
    await userEvent.click(page.getByRole('tab', { name: 'Account' }));
    await expect(page.getByRole('link', { name: /^Delete account$/ })).toBeVisible();
  },
});

/** The pictures the methods report, as production serves them: the Storybook image worker answers for these paths. */
const GOOGLE_PICTURE =
  'https://dune.zone/user-images/409fbbeb9c14078b27140eb9f76bd68cacbb246db0f5ec32cb43215654769c9d.jpg';
const DISCORD_PICTURE =
  'https://dune.zone/user-images/4c76179e0f54fb2644da18a766b602bcafc5a0d6e37501d05e54d3de994d8a5b.jpg';

/** What Google reported at the viewer's last sign-in with it. */
function googleReported(baseline: StorybookDatabase, name = 'Central Command') {
  baseline.linked_account_profiles.push({
    user_id: ref('storybook-viewer'),
    provider: 'google',
    name,
    image: GOOGLE_PICTURE,
    synced_at: STORYBOOK_NOW - 86_400_000,
  });
}

/**
 * One connected method with something to offer: Resync takes its name and picture at once.
 * The name changes the address, which the page follows without leaving the tab or losing its answer.
 */
export const ResyncTakesTheOnlyMethod = meta.story({
  args: { path: '/profiles/central/edit?tab=sign-in' },
  parameters: {
    database: db((baseline) => {
      googleConnected(baseline);
      googleReported(baseline);
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Resync' }, { timeout: 30_000 }));
    await expect(
      page.findByText('Name and picture updated from Google.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sign-in methods' })).toHaveAttribute('aria-selected', 'true');
    /* The new name moved the profile to a new address, which the page follows before its tabs are back. */
    await waitFor(
      async () => {
        await userEvent.click(page.getByRole('tab', { name: 'Profile' }));
        await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue('CentralCommand');
      },
      { timeout: 30_000 }
    );
    await expect(page.getByRole('textbox', { name: 'Avatar image URL' })).toHaveValue(GOOGLE_PICTURE);
  },
});

/** Two methods with something to offer: Resync lays them out, and the reader picks the one the profile takes. */
export const ResyncOffersAChoice = meta.story({
  args: { path: '/profiles/central/edit?tab=sign-in' },
  parameters: {
    database: db((baseline) => {
      googleConnected(baseline);
      googleReported(baseline, 'Central Command');
      baseline.authAccounts.push({
        userId: ref('storybook-viewer'),
        provider: 'discord',
        providerAccountId: 'discord-story',
      });
      baseline.linked_account_profiles.push({
        user_id: ref('storybook-viewer'),
        provider: 'discord',
        name: 'Ix',
        image: DISCORD_PICTURE,
        synced_at: STORYBOOK_NOW - 3_600_000,
      });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Resync' }, { timeout: 30_000 }));
    const offers = within(
      await page.findByRole('list', { name: 'Sign-in methods with a name or picture to offer' }, { timeout: 30_000 })
    );
    await expect(offers.getByText('Takes the name CentralCommand and picture.')).toBeVisible();
    await expect(offers.getByText(/“Ix” does not fit a display name/)).toBeVisible();
    await userEvent.click(offers.getByRole('button', { name: 'Use Discord name and picture' }));
    await expect(page.findByText(/^Picture updated from Discord/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('list', { name: 'Sign-in methods with a name or picture to offer' })).toBeNull();
  },
});

/**
 * Connecting a method is refused unless the session signed in minutes ago, and the Storybook viewer's session never signed in, so the backend refuses it the way it refuses a stale one.
 * The refusal keeps the server's words and carries the way through: the sign-in page's re-sign-in mode, returning to this tab, which the address names so the return lands on it.
 */
export const SignInMethodsNeedARecentSignIn = meta.story({
  args: { path: '/profiles/central/edit?tab=sign-in' },
  parameters: { database: db(googleConnected) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const connect = await page.findByRole('button', { name: 'Connect Discord' }, { timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Sign-in methods' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(connect);
    const alert = await page.findByRole('alert', {}, { timeout: 30_000 });
    await expect(alert).toHaveTextContent('Sign-in methods could not be changed');
    await expect(alert).toHaveTextContent('Sign in again to confirm it is you, then try again.');
    await expect(within(alert).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fprofiles%2Fcentral%2Fedit%3Ftab%3Dsign-in&reauthenticate=true'
    );
    await expect(connect).toBeEnabled();
  },
});

/**
 * The way through that refusal: signing in again offers only the methods already connected to the profile.
 * Discord or Steam would sign in to a separate account, so picking one there could never connect it.
 */
export const SignInAgainOffersConnectedMethods = meta.story({
  args: { path: '/auth/login?redirect=%2Fprofiles%2Fcentral%2Fedit%3Ftab%3Dsign-in&reauthenticate=true' },
  parameters: { database: db(googleConnected) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Sign in again' }, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(page.getAllByRole('button', { name: /^Continue with / })).toHaveLength(1), {
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  },
});

const HOUR = 60 * 60_000;

/**
 * The same refusal on the deletion page, after the held delete: the form stays for the retry, and the way through returns to this page.
 * Deleting needs a session, so the viewer signs in at the seeding and opens the page an hour later, past the ten minutes a sign-in counts for.
 */
export const DeleteAccountNeedsARecentSignIn = meta.story({
  args: { path: '/profiles/central/delete' },
  parameters: {
    identity: { ...storybookViewer, sessionKey: 'viewer-session' },
    database: db(
      (baseline) => {
        baseline.authSessions.push({
          $key: 'viewer-session',
          userId: ref('storybook-viewer'),
          expirationTime: STORYBOOK_NOW + 30 * 24 * HOUR,
        });
      },
      { elapsedMs: HOUR }
    ),
  },
  play: async ({ canvasElement }) => {
    const page = await findDeletionPage(canvasElement);
    await userEvent.click(page.getByRole('checkbox'));
    const hold = page.getByRole('button', { name: 'Delete account' });
    await expect(hold).toBeEnabled();
    const clock = install({ toFake: ['setInterval', 'clearInterval'], shouldClearNativeTimers: true });
    try {
      await userEvent.pointer([{ keys: '[MouseLeft>]', target: hold }]);
      await clock.tickAsync(HOLD_SECONDS * 1000);
    } finally {
      await userEvent.pointer([{ keys: '[/MouseLeft]', target: canvasElement.ownerDocument.body }]);
      clock.uninstall();
    }
    const alert = await page.findByRole('alert', {}, { timeout: 30_000 });
    await expect(alert).toHaveTextContent('Account deletion could not start');
    await expect(alert).toHaveTextContent('Sign in again to confirm it is you, then try again.');
    await expect(within(alert).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fprofiles%2Fcentral%2Fdelete&reauthenticate=true'
    );
    await expect(page.getByRole('checkbox')).toBeChecked();
  },
});

/**
 * The settings page reached by a reader who is not signed in: the gate frame, not the form.
 * Coverable since the session gate reads `useSessionViewer` and the seam's signed-out answer stopped collapsing into the pending shape (#803).
 */
export const SettingsSignedOut = meta.story({
  args: { path: '/profiles/central/edit' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to profiles' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Save profile' })).toBeNull();
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
/** Eight more factions by the viewer beside House Atreides, each a day newer than the last, so the profile has more than its first few. */
function seedMoreFactions(baseline: StorybookDatabase) {
  for (let index = 1; index <= 8; index += 1) {
    const number = String(index).padStart(2, '0');
    baseline.factions.push({
      ...faction({ name: `Sietch ${number}` }),
      created_at: `2026-03-${number}T00:00:00Z`,
      updated_at: `2026-03-${number}T00:00:00Z`,
    });
  }
}

/** More profiles than one page holds, so the directory pages them and a search narrows them. */
export const DirectoryPagesAndSearch = meta.story({
  args: { path: '/profiles?page=2' },
  parameters: { database: db(seedFremen) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    /* Central sorts first, so the second page starts with Fremen 24 and ends with Fremen 30. */
    await expect(main.findByRole('link', { name: /Fremen 24/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(main.getByRole('link', { name: /Fremen 30/ })).toBeVisible();
    await expect(main.queryByRole('link', { name: /Fremen 23/ })).toBeNull();
    await expect(main.queryByRole('link', { name: /Central/ })).toBeNull();
    await expect(page.getByRole('link', { name: 'First page' })).toHaveAttribute('href', '/profiles');

    await userEvent.type(page.getByRole('textbox', { name: 'Search profiles' }), 'Fremen 07');
    await expect(main.findByRole('link', { name: /Fremen 07/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(main.queryByRole('link', { name: /Central/ })).toBeNull());
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
    await expect(main.queryByRole('link', { name: /Central/ })).toBeNull();
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
 * On a tablet the faction list sits beside the sidebar and is narrower than 30rem, so it shows two columns, though the window is at the tablet step.
 * The list counts its columns from its own width.
 * A list that asked the window would show one column here.
 */
export const DetailTablet = meta.story({
  args: { path: '/profiles/central' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const factions = await page.findByRole('region', { name: 'Factions created' }, { timeout: 30_000 });
    await expectFactionColumns(factions, 2);
  },
});

/**
 * A member with more factions than the profile shows: the newest three, and a link to all of them in the catalogue narrowed to the member, in the same order.
 * The header counts the whole list rather than the slice.
 */
export const DetailFactionsPreview = meta.story({
  args: { path: '/profiles/central' },
  parameters: { database: db(seedMoreFactions) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'All 9 factions' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/factions?owner=central&sort=created'
    );
    const factions = within(page.getByRole('region', { name: 'Factions created' }));
    const cards = factions.getAllByRole('link', { name: /Sietch|House Atreides/ });
    await expect(cards).toHaveLength(3);
    await expect(cards[0]).toHaveAccessibleName(/Sietch 08/);
    await expect(page.getByText('9 factions')).toBeVisible();
  },
});

export const BoardGameGeekProfileLink = meta.story({
  args: { path: '/profiles/central' },
  parameters: {
    database: db((baseline) => {
      const profile = baseline.profiles.find((row) => row.slug === 'central');
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
 * The leaderboards stop at five, and the Groups list grows with Load more.
 * A search drops the boards and Groups, so only the matching profiles remain.
 */
export const DirectoryLeaderboards = meta.story({
  args: { path: '/profiles' },
  parameters: { database: db(seedLeaderboards) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    const designers = within(await main.findByRole('list', { name: 'Faction designers ranking' }, { timeout: 30_000 }));
    await expect(designers.getAllByRole('listitem')).toHaveLength(5);
    await expect(designers.getAllByRole('listitem')[0]).toHaveTextContent(/Duncan/);

    const groups = within(main.getByRole('list', { name: 'Groups ranking' }));
    await expect(groups.getAllByRole('listitem')).toHaveLength(5);
    await userEvent.click(main.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(groups.getAllByRole('listitem').length).toBeGreaterThan(5), { timeout: 30_000 });

    await userEvent.type(page.getByRole('textbox', { name: 'Search profiles' }), 'Chani');
    await waitFor(() => expect(main.queryByRole('list', { name: 'Faction designers ranking' })).toBeNull(), {
      timeout: 30_000,
    });
    await expect(main.queryByRole('list', { name: 'Groups ranking' })).toBeNull();
  },
});
