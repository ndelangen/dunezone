import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
import { expectWithinWidth } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Site',
  ...pageStoryMeta,
});

/**
 * The most-reached message in the application, and the last one to wear the shared frame.
 * The assertions distinguish the frame from what stood here before, which was a bare paragraph and a raw link under a title with no pane.
 */
export const NotFound = meta.story({
  args: { path: '/a-page-that-does-not-exist' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByRole('heading', { name: 'This page does not exist' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Go back home' }, { timeout: 30_000 });
    await expect(back.closest('main')).toBeNull();
  },
});
/** The job queue for an administrator: the session says so, and only then does the page ask for the admin-only listing. */
export const PublicationJobs = meta.story({
  args: { path: '/_admin/jobs' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('combobox', { name: 'Status' }, { timeout: 30_000 })).resolves.toBeVisible();
    const [, job] = await page.findAllByRole('row', {}, { timeout: 30_000 });
    await expect(within(job!).getByText('house-atreides')).toBeVisible();
    await expect(within(job!).getByText('Pending')).toBeVisible();
    /* The switch only flips once the backend has stored the new setting, so its label is the proof the mutation ran. */
    await userEvent.click(page.getByRole('switch', { name: 'Enabled' }));
    await expect(page.findByRole('switch', { name: 'Disabled' }, { timeout: 30_000 })).resolves.not.toBeChecked();
  },
});

/** The job queue reached by a reader the server does not recognise, which is a login gate rather than an alert inside a dashboard header. */
export const PublicationJobsSignedOut = meta.story({
  args: { path: '/_admin/jobs' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* The dashboard's own header, with its briefcase and its description, is what the frame replaces. */
    await expect(
      page.queryByText(
        'Inspect the durable work queue and control whether the next scheduled run may pick up pending work.'
      )
    ).toBeNull();
  },
});
/** The job queue reached by a signed-in reader without the administrative role. */
export const PublicationJobsNotAuthorized = meta.story({
  args: { path: '/_admin/jobs' },
  parameters: withoutAdmins,
  play: async ({ canvasElement }) => {
    await expectRefused(canvasElement, 'You cannot view publication jobs', { role: 'combobox', name: 'Status' });
  },
});
async function findTitledPage(canvasElement: HTMLElement, name: RegExp) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(page.findByRole('heading', { level: 1, name }, { timeout: 30_000 })).resolves.toBeVisible();
  return page;
}

const titled =
  (name: RegExp) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await findTitledPage(canvasElement, name);
  };

export const FuturePlans = meta.story({
  args: { path: '/future-plans' },
  play: titled(/^A map of what Dune Zone could become$/),
});
export const Privacy = meta.story({ args: { path: '/privacy' }, play: titled(/privacy/i) });

/** The blog's numbered list of posts, newest first, each title opening its post. */
export const Blog = meta.story({
  args: { path: '/blog' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Why Dune?' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/blog/why-dune'
    );
  },
});

/** One post, "Why Dune?": its title and byline in the band, then a video that loads only when played, photographs, a link to the Dreamrules Workshop mod, and the Dream Rulebook cover to close. */
export const BlogPost = meta.story({
  args: { path: '/blog/why-dune' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { level: 1, name: 'Why Dune?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('button', { name: 'Play MCDM Plays Dune - Round 1' })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Dreamrules TTS mod' })).resolves.toHaveAttribute(
      'href',
      'https://steamcommunity.com/sharedfiles/filedetails/?id=2859509846'
    );
  },
});

/** The third post, about the early projects: its title in the band, and links to the dune-assets repository and the Atreides page. */
export const BlogPostAllInOneDuneBoardGameWebapp = meta.story({
  args: { path: '/blog/all-in-one-dune-board-game-webapp' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole(
        'heading',
        { level: 1, name: 'My earlier attempts at building an all-in-one webapp for the Dune board game' },
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'dune-assets' })).resolves.toHaveAttribute(
      'href',
      'https://github.com/ndelangen/dune-assets'
    );
    await expect(page.findByRole('link', { name: 'dune.zone' })).resolves.toHaveAttribute(
      'href',
      '/factions/house-atreides'
    );
  },
});

/** The second post, about Tabletop Simulator: its title in the band, then screenshots, and links to the Workshop mods and the Iduali faction. */
export const BlogPostTabletopSimulator = meta.story({
  args: { path: '/blog/tabletop-simulator' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { level: 1, name: 'Building Dune on Tabletop Simulator' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'GF9 Dune 2019 (Discord Mod)' })).resolves.toHaveAttribute(
      'href',
      'https://steamcommunity.com/sharedfiles/filedetails/?id=1972622978'
    );
    await expect(page.findByRole('link', { name: 'Iduali' })).resolves.toHaveAttribute('href', '/factions/iduali');
  },
});

export const BlogPostPhone = meta.story({
  args: { path: '/blog/why-dune' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Why Dune\?$/);
    const video = await page.findByRole('button', { name: 'Play MCDM Plays Dune - Round 1' });
    const figures = await page.findAllByRole('figure');
    await expect(figures.length).toBeGreaterThan(1);
    await expectWithinWidth(canvasElement, [video, ...figures]);
  },
});

/** The hard-coded glossary: one Section per topic with a picture, every term reachable by its anchor and found by the word it replaces. */
export const Glossary = meta.story({
  args: { path: '/glossary' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Troop' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(canvasElement.ownerDocument.getElementById('battle')).not.toBeNull();
    await userEvent.type(page.getByRole('textbox', { name: 'Search the glossary' }), 'combat');
    await expect(page.findByRole('heading', { name: 'Battle', level: 3 })).resolves.toBeVisible();
    await expect(page.queryByRole('heading', { name: 'Troop' })).toBeNull();
  },
});

/** The same page at phone width, where each picture sits above its terms. */
export const GlossaryPhone = meta.story({
  args: { path: '/glossary' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /glossary/i);
    await expect(page.findByRole('heading', { name: 'Troop' }, { timeout: 30_000 })).resolves.toBeVisible();
    const topics = [...canvasElement.ownerDocument.querySelectorAll('section[id^="topic-"]')];
    await expect(topics.length).toBeGreaterThan(1);
    await expectWithinWidth(canvasElement, topics);
  },
});

export const Accounts = meta.story({
  args: { path: '/_admin/accounts' },
  parameters: {
    database: db((baseline) => {
      baseline.users.push({ $key: 'other-account', name: 'Discord player' });
      baseline.profiles.push({
        $key: 'other-profile',
        user_id: ref('other-account'),
        username: 'Discord player',
        slug: 'discord-player',
        avatar_url: null,
        account_state: 'active',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
      baseline.authAccounts.push(
        { userId: ref('other-account'), provider: 'discord', providerAccountId: 'discord-story' },
        { userId: ref('storybook-viewer'), provider: 'google', providerAccountId: 'google-story' }
      );
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('combobox', { name: 'Profile to keep' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: 'storybook-viewer · storybook-viewer' }));
    await userEvent.click(page.getByRole('combobox', { name: 'Profile to merge into it' }));
    await userEvent.click(await page.findByRole('option', { name: 'Discord player · discord-player' }));
    await userEvent.click(page.getByRole('button', { name: 'Review merge' }));
    await expect(page.findByRole('button', { name: 'Merge into storybook-viewer' })).resolves.toBeVisible();
    await expect(page.getByText('This merge cannot be undone. The other profile will be signed out.')).toBeVisible();
  },
});
