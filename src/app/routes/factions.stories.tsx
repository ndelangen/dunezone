import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, faction, ref, refText, SEED_REF_TOKEN } from '@db/storybook';

import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import {
  seedAnotherMember,
  memoryHistory,
  pageHistory,
  gridCards,
  withTroopDetails,
  withPlanets,
  expectLeaderLane,
} from './factions.stories.fixture';
import { expectFieldValue, expectWithinWidth } from './pagePlay';
import { StorybookPage } from './storybook';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Factions',
  ...pageStoryMeta,
});

export const Catalogue = meta.story({
  args: { path: '/factions' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [card] = await page.findAllByRole('link', { name: /House Atreides/ }, { timeout: 30_000 });
    await expect(card).toBeVisible();
  },
});

/** Past one page the catalogue numbers its pages as real links, and `?page=2` opens the second page directly. */
export const CataloguePaged = meta.story({
  args: { path: '/factions?page=2' },
  parameters: {
    database: db((baseline) => {
      for (let index = 1; index <= 60; index += 1) {
        baseline.factions.push(faction({ name: `Sietch ${String(index).padStart(2, '0')}` }));
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText(/^49–61 of 61 factions$/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    const pages = await page.findByLabelText('Faction catalogue pages');
    await expect(within(pages).getByRole('link', { name: '1' })).toHaveAttribute('href', '/factions');
  },
});

/**
 * The catalogue narrowed to one member, as a profile's "All N factions" opens it: their factions alone, the member named among the refinements, and a way back to everyone's.
 */
export const CatalogueByOwner = meta.story({
  args: { path: '/factions?owner=storybook-viewer' },
  parameters: { database: db(seedAnotherMember) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    await expect(main.findAllByRole('link', { name: /House Atreides/ }, { timeout: 30_000 })).resolves.toHaveLength(1);
    await expect(main.queryByRole('link', { name: /Sietch Tabr/ })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Refine factions by member, ruleset and complexity' }));
    /* The popover fades in, so its words are in the document a moment before they are visible. */
    await waitFor(() => expect(page.getByRole('group', { name: 'Member' })).toBeVisible());
    await expect(page.getByText('By storybook-viewer')).toBeVisible();
    await expect(page.getByText('1 of 2 factions')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: "Show every member's factions" }));
    await waitFor(() => expect(main.getByRole('link', { name: /Sietch Tabr/ })).toBeVisible(), { timeout: 30_000 });
  },
});

/**
 * Choosing a ruleset while a member is set leaves the member's list: the member goes from the address and the grid widens to the ruleset's factions.
 * The change replaces the history entry, as every filter does, so Back from here would leave the catalogue.
 */
export const CatalogueRulesetLeavesTheMembersList = meta.story({
  args: { path: '/factions?owner=storybook-viewer' },
  parameters: { database: db(seedAnotherMember) },
  loaders: [memoryHistory('/factions?owner=storybook-viewer')],
  render: (args, { loaded }) => <StorybookPage {...args} history={pageHistory(loaded)} />,
  play: async ({ canvasElement, loaded }) => {
    const history = pageHistory(loaded);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(gridCards(page, /House Atreides/)).toHaveLength(1), { timeout: 30_000 });
    await expect(gridCards(page, /Sietch Tabr/)).toHaveLength(0);
    await expect(history.location.search).toBe('?owner=storybook-viewer');

    await userEvent.click(page.getByRole('button', { name: 'Refine factions by member, ruleset and complexity' }));
    const rulesets = await page.findByRole('group', { name: 'Filter factions by ruleset' });
    await userEvent.click(within(rulesets).getByRole('button', { name: /ClassicRules/ }));
    await waitFor(() => expect(gridCards(page, /Sietch Tabr/)).toHaveLength(1), { timeout: 30_000 });
    await expect(gridCards(page, /House Atreides/)).toHaveLength(1);
    await expect(history.location.search).toBe('?ruleset=classicrules');
    await expect(history.length).toBe(1);
    await waitFor(() => expect(page.queryByRole('group', { name: 'Member' })).toBeNull());
  },
});

/** A member nobody answers to leaves the address, and the grid is everyone's. */
export const CatalogueByUnknownOwner = meta.story({
  args: { path: '/factions?owner=nobody' },
  parameters: { database: db(seedAnotherMember) },
  loaders: [memoryHistory('/factions?owner=nobody')],
  render: (args, { loaded }) => <StorybookPage {...args} history={pageHistory(loaded)} />,
  play: async ({ canvasElement, loaded }) => {
    const history = pageHistory(loaded);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(gridCards(page, /Sietch Tabr/)).toHaveLength(1), { timeout: 30_000 });
    await expect(gridCards(page, /House Atreides/)).toHaveLength(1);
    await waitFor(() => expect(history.location.search).toBe(''), { timeout: 30_000 });
    await expect(history.location.pathname).toBe('/factions');
    await expect(page.getByRole('button', { name: 'Refine factions by ruleset and complexity' })).toBeVisible();
  },
});

/**
 * An old "All N factions" link from before the member's rename: the address moves on to their current slug, as the profile page's does, and the grid is theirs.
 */
export const CatalogueByFormerOwnerSlug = meta.story({
  args: { path: '/factions?owner=storybook-reader' },
  parameters: {
    database: db((baseline) => {
      seedAnotherMember(baseline);
      baseline.former_slugs.push({
        kind: 'profile',
        scope: '',
        slug: 'storybook-reader',
        record_id: ref('storybook-viewer-profile'),
      });
    }),
  },
  loaders: [memoryHistory('/factions?owner=storybook-reader')],
  render: (args, { loaded }) => <StorybookPage {...args} history={pageHistory(loaded)} />,
  play: async ({ canvasElement, loaded }) => {
    const history = pageHistory(loaded);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(gridCards(page, /House Atreides/)).toHaveLength(1), { timeout: 30_000 });
    await expect(gridCards(page, /Sietch Tabr/)).toHaveLength(0);
    await waitFor(() => expect(history.location.search).toBe('?owner=storybook-viewer'), { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'Refine factions by member, ruleset and complexity' }));
    await waitFor(() => expect(page.getByText('By storybook-viewer')).toBeVisible());
  },
});

/**
 * On a phone the faction list shows two columns and each card its compact caption.
 * The list reads its own width and the card its own, so neither needs the page.
 * This story shows them in the catalogue's phone layout.
 */
export const CatalogueMobile = meta.story({
  args: { path: '/factions' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const links = await page.findAllByRole('link', { name: /House Atreides/ }, { timeout: 30_000 });
    const card = links.find((link) => link.closest('main'));
    /* Two columns: a card takes at most half of the content's width. */
    const content = card!.closest('main')!.getBoundingClientRect();
    await expect(card!.getBoundingClientRect().width).toBeLessThanOrEqual(content.width / 2);
  },
});

export const Detail = meta.story({
  args: { path: '/factions/house-atreides' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'House Atreides' })).resolves.toBeVisible();
    await expect(page.queryByRole('region', { name: 'Planets' })).not.toBeInTheDocument();
  },
});

export const DetailWithTroopStrengthsMobile = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: withTroopDetails, identity: null },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const troops = await page.findByRole('region', { name: 'Troops' });
    const sectionBounds = troops.getBoundingClientRect();
    for (const card of within(troops).getAllByRole('article')) {
      const bounds = card.getBoundingClientRect();
      await expect(bounds.left).toBeGreaterThanOrEqual(sectionBounds.left);
      await expect(bounds.right).toBeLessThanOrEqual(sectionBounds.right);
      await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    }
  },
});

export const DetailWithIndependentTroopFaces = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: {
    identity: null,
    database: db((baseline) => {
      const data = baseline.factions[0]!.data;
      const art = data.troops[0]!;
      data.troops = [
        {
          ...art,
          name: 'A troop with a long authored name',
          count: 1,
          combat: { strength: 0, supportedStrength: 1.5, supportCost: 0 },
          back: {
            image: art.image,
            description: 'The reverse has its own battle values.',
            name: 'An independently authored reverse',
            combat: { strength: 0.5, supportedStrength: 1, supportCost: 2 },
          },
        },
      ];
    }),
  },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const troops = within(await page.findByRole('region', { name: 'Troops' }));
    await expect(troops.getByRole('img', { name: 'Strength per troop: 0 unsupported | 1.5 supported' })).toBeVisible();
    await expect(troops.getByRole('img', { name: 'Support cost: 0 spice per supported troop' })).toBeVisible();
    await expect(troops.getByRole('img', { name: 'Strength per troop: 0.5 unsupported | 1 supported' })).toBeVisible();
    const card = troops.getByRole('article');
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    const flip = troops
      .getByRole('img', { name: 'Flip side: An independently authored reverse' })
      .getBoundingClientRect();
    const frontCost = troops
      .getByRole('img', { name: 'Support cost: 0 spice per supported troop' })
      .getBoundingClientRect();
    const backCost = troops
      .getByRole('img', { name: 'Support cost: 2 spice per supported troop' })
      .getBoundingClientRect();
    const count = troops.getByRole('img', { name: '1 troop token' }).getBoundingClientRect();
    await expect(frontCost.right).toBeLessThanOrEqual(flip.left);
    await expect(backCost.right).toBeLessThanOrEqual(count.left);
  },
});

/** The sidebar is beside an overflowing leader row just above the desktop breakpoint. */
export const DetailWithOverflowingLeaders = meta.story({
  args: { path: '/factions/space-orks' },
  parameters: {
    database: withPlanets(),
    identity: null,
    viewport: {
      options: {
        factionOverflow: { name: 'Faction overflow', styles: { width: '1024px', height: '900px' } },
      },
    },
  },
  globals: { viewport: { value: 'factionOverflow' } },
  play: async ({ canvasElement }) => {
    await expectLeaderLane(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const leaders = page.getByRole('region', { name: 'Leaders' });
    const lane = within(leaders).getAllByRole('article')[0]!.parentElement!;
    const sidebar = page.getByRole('complementary', { name: 'Faction details' });
    await expect(lane.scrollWidth).toBeGreaterThan(lane.clientWidth);
    await expect(lane.getBoundingClientRect().right).toBeLessThanOrEqual(sidebar.getBoundingClientRect().left);
  },
});

export const DetailWithOverflowingLeadersMobile = meta.story({
  args: { path: '/factions/space-orks' },
  parameters: { database: withPlanets(), identity: null },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    await expectLeaderLane(canvasElement);
  },
});

export const DetailWithPlanetsMobile = meta.story({
  args: { path: '/factions/space-orks' },
  parameters: { database: withPlanets(), identity: null },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const planets = await page.findByRole('region', { name: 'Planets' }, { timeout: 30_000 });
    await expectWithinWidth(canvasElement, [planets, ...within(planets).getAllByRole('listitem')]);
  },
});
/** An editor at rest is mounted once its Name field reads what the page loaded. */
export const Create = meta.story({
  args: { path: '/factions/create' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Faction name', 'New faction'),
});
export const Edit = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Faction name', 'House Atreides'),
});

/* A current faction sheet with a replacement capture that failed after it (#1318, #1385). */
const currentSheetWithAFailedReplacement = db((baseline) => {
  const factionId = refText('faction:house-atreides', SEED_REF_TOKEN);
  baseline.publication_assets.push({
    asset_type: 'faction_sheet',
    asset_id: factionId,
    cache_token: 'storybook-sheet',
    published_at: Date.parse('2026-01-01T12:00:00.000Z'),
  });
  baseline.publication_jobs.push({
    asset_type: 'faction_sheet',
    asset_id: factionId,
    asset_data: {},
    status: 'error',
    attempt_counter: 10,
    error: 'Storybook capture failure',
    created_at: Date.parse('2026-01-01T13:00:00.000Z'),
    updated_at: Date.parse('2026-01-01T13:10:00.000Z'),
  });
});

/**
 * Someone who can edit the faction is told when a replacement capture failed beside a current sheet (#1385).
 * The previous sheet stays published (CONTEXT.md, Asset publication state), so the words say it may be out of date, and the published PDF stays on offer.
 */
export const DetailTellsItsEditorsAReplacementFailed = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: currentSheetWithAFailedReplacement },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Confirms this viewer can edit, so this story and the reader's one cover both kinds of viewer. */
    await expect(page.findByRole('link', { name: 'Edit faction' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByText('The published faction sheet may be out of date because the latest changes were not captured.')
    ).resolves.toBeVisible();
    await expect(page.findByText('Update failed')).resolves.toBeVisible();
    await expect(page.queryByText('Current')).toBeNull();
    await expect(page.findByRole('link', { name: 'Open published PDF' })).resolves.toBeVisible();
  },
});

/**
 * A reader is told the same, since the sheet they download may be out of date (#1385).
 * The published PDF stays on offer beside it.
 */
export const DetailTellsReadersAReplacementFailed = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: currentSheetWithAFailedReplacement, identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText(
        'The published faction sheet may be out of date because the latest changes were not captured.',
        {},
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
    await expect(page.findByText('Update failed')).resolves.toBeVisible();
    await expect(page.queryByText('Current')).toBeNull();
    await expect(page.queryByRole('link', { name: 'Edit faction' })).toBeNull();
    await expect(page.findByRole('link', { name: 'Open published PDF' })).resolves.toBeVisible();
  },
});

/**
 * A faction that is not there declares the same band as one that is (#660).
 *
 * Six pages used to answer the "what kind of page is this" question twice: `default` while they had no data, `compact` once they had it.
 * The band carries `transition: height 0.2s ease-out`, so the reader watched it collapse by 143px as the page resolved, with everything below moving up with it.
 *
 * The assertion is the declaration rather than the pixel height, because the height is CSS's answer to the declaration and asserting it here would make this story a second copy of the stylesheet.
 */
export const DetailNotFoundDeclaresTheLoadedBand = meta.story({
  args: { path: '/factions/no-such-faction' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Confirms this is a placeholder state and not a loaded page that happens to agree. */
    await expect(page.findByText('Back to factions', {}, { timeout: 30_000 })).resolves.toBeVisible();

    const root = canvasElement.ownerDocument.querySelector('[data-page-layout-header-size]');
    await expect(root?.getAttribute('data-page-layout-header-size')).toBe('compact');
  },
});

const FACTION_EDIT_STATUSES = ['No unsaved changes', 'The public asset will be available soon.'];

/**
 * The faction editor's toolbar at a phone, tablet, laptop and desktop width, on one line at each (#1423).
 * The seeded faction states two things at rest, both behind the Status action: nothing unsaved, and no publication yet.
 */
export const EditToolbarAt360 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
export const EditToolbarAt768 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
export const EditToolbarAt1100 = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: FACTION_EDIT_STATUSES }),
});
