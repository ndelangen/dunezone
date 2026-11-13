import preview from '@sb/preview';
import { TREACHERY_TRACKER_RULE } from '@shared/factions/treacheryTrackerRule';
import { expect, userEvent, within } from 'storybook/test';

import {
  withTreacheryTracker,
  withTroopDetails,
  withPlanets,
  expectLeaderLane,
  currentSheetWithAFailedReplacement,
  variantMaintainerOutsideTheFactionGroup,
  factionMaintainerOutsideTheVariantGroup,
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

/** A faction whose rules keep the Treachery tracker says so in its Setup, beside its start and revival. */
export const DetailKeepsATreacheryTracker = meta.story({
  args: { path: '/factions/house-atreides' },
  parameters: { database: withTreacheryTracker },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const setup = await page.findByRole('region', { name: 'Setup' }, { timeout: 30_000 });
    await expect(within(setup).getByText(TREACHERY_TRACKER_RULE)).toBeVisible();
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

/** The Faction chapter's own controls, which every variant of the Faction shares. */
async function factionChapterControls(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const name = await page.findByRole('textbox', { name: 'Faction name' }, { timeout: 30_000 });
  return {
    page,
    controls: [
      name,
      page.getByRole('combobox', { name: 'Faction emblem' }),
      page.getByRole('textbox', { name: 'Faction sheet theme' }),
      page.getByRole('combobox', { name: 'TTS color 1' }),
      page.getByRole('button', { name: 'Drag to reorder TTS color 1' }),
      page.getByRole('button', { name: 'Remove last TTS color' }),
      page.getByRole('button', { name: 'Add TTS color' }),
      page.getByRole('combobox', { name: 'Background preset' }),
      /* House Atreides paints a custom background, so the composer is open under the preset. */
      page.getByRole('button', { name: 'Random pattern' }),
      page.getByRole('switch', { name: 'Invert' }),
    ],
  };
}

/**
 * The editor's first chapter is the Faction: the name, emblem, colors and background every variant shares (#2926).
 * Its owner may change them, under a notice that says how far a change reaches.
 */
export const EditFactionChapter = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const { page, controls } = await factionChapterControls(canvasElement);
    await expect(page.getByRole('tab', { name: /^Faction(?! leader)/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Shared by every variant')).toBeVisible();
    for (const control of controls) {
      await expect(control).toBeEnabled();
    }
  },
});

/**
 * A member of the variant's Group who has no part in the Faction's (#2926).
 * The Faction chapter names who may change its fields and disables each one;
 * the other chapters stay theirs to edit.
 */
export const EditFactionChapterReadOnly = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  parameters: { database: variantMaintainerOutsideTheFactionGroup },
  play: async ({ canvasElement }) => {
    const { page, controls } = await factionChapterControls(canvasElement);
    await expect(page.getByText('Only the maintainers of House Atreides can change these')).toBeVisible();
    await expect(page.getByText(/Chani Kynes and the members of Landsraad Archivists can change them\./)).toBeVisible();
    for (const control of controls) {
      await expect(control).toBeDisabled();
    }
    await userEvent.click(page.getByRole('tab', { name: /^Faction leader/ }));
    await expect(page.findByRole('textbox', { name: 'Faction leader name' })).resolves.toBeEnabled();
  },
});

/**
 * A member of the Faction's Group who has no part in the variant's (#2926).
 * The editor opens on the Faction chapter alone, since no other chapter is theirs to change.
 */
export const EditFactionChapterAlone = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  parameters: { database: factionMaintainerOutsideTheVariantGroup },
  play: async ({ canvasElement }) => {
    const { page, controls } = await factionChapterControls(canvasElement);
    await expect(page.getByText(/The rest of the .+ variant is for its own owner and Group to edit\./)).toBeVisible();
    for (const control of controls) {
      await expect(control).toBeEnabled();
    }
    await expect(page.queryByRole('tab', { name: /^Faction leader/ })).toBeNull();
    await expect(page.queryByRole('option', { name: /^Faction leader/ })).toBeNull();
  },
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
