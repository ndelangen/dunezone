import preview from '@sb/preview';
import { expectFactionColumns } from '@ui/list/factionListPlay';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, faction, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectFieldValue } from './pagePlay';
import { findDeletionPage } from './profiles.stories.fixture';
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
/** A contributor's two FAQ sections use the shared question rows. */
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
    /* Both profile sections use the standard mixed-ruleset question list. */
    await expect(page.queryByRole('region', { name: 'Sign-in methods' })).toBeNull();
    const citations = await page.findAllByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });
    await expect(citations.length).toBeGreaterThan(1);
    for (const section of ['Questions answered', 'Questions asked']) {
      const list = within(page.getByRole('region', { name: section }));
      await expect(list.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
      await expect(list.getByText('Asked by:')).toBeVisible();
      await expect(list.getByText('Answered by:')).toBeVisible();
      await expect(list.queryByText('Move the storm marker at the start of the storm phase.')).toBeNull();
      await expect(list.getByRole('link', { name: /Open question:/ })).toBeVisible();
    }
  },
});
/** At phone width both FAQ sections inherit the standard Lean rows. */
export const DetailNarrow = meta.story({
  args: { path: '/profiles/storybook-viewer' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    for (const section of ['Questions answered', 'Questions asked']) {
      const list = within(await page.findByRole('region', { name: section }, { timeout: 30_000 }));
      await expect(list.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
      await expect(list.getByText('Asked by:')).not.toBeVisible();
      await expect(list.getByText('Answered by:')).not.toBeVisible();
      await expect(
        list.getAllByText('1 answer', { exact: true }).find((element) => element.getClientRects().length > 0)
      ).toBeVisible();
      const rulesetLinks = list.getAllByRole('link', { name: 'ClassicRules' });
      await expect(rulesetLinks.some((link) => link.getClientRects().length > 0)).toBe(true);
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

/**
 * A member with more factions than the profile shows: the newest three, and a link to all of them in the catalogue narrowed to the member, in the same order.
 * The header counts the whole list rather than the slice.
 */
export const DetailFactionsPreview = meta.story({
  args: { path: '/profiles/storybook-viewer' },
  parameters: { database: db(seedMoreFactions) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'All 9 factions' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/factions?owner=storybook-viewer&sort=created'
    );
    const factions = within(page.getByRole('region', { name: 'Factions created' }));
    const cards = factions.getAllByRole('link', { name: /Sietch|House Atreides/ });
    await expect(cards).toHaveLength(3);
    await expect(cards[0]).toHaveAccessibleName(/Sietch 08/);
    await expect(page.getByText('9 factions')).toBeVisible();
  },
});

export const Settings = meta.story({
  args: { path: '/profiles/storybook-viewer/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Display name', 'storybook-viewer'),
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

export const DeleteAccount = meta.story({
  args: { path: '/profiles/storybook-viewer/delete' },
  play: async ({ canvasElement }) => {
    const page = await findDeletionPage(canvasElement);
    await expect(page.getByRole('button', { name: 'Choose a replacement owner' })).toBeVisible();
  },
});
