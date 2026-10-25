import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import {
  withTroopDetails,
  withPlanets,
  expectLeaderLane,
  currentSheetWithAFailedReplacement,
} from './factions.stories.fixture';
import { expectFieldValue } from './pagePlay';
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
export const Edit = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Faction name', 'House Atreides'),
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
