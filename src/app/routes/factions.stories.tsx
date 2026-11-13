import preview from '@sb/preview';
import { TREACHERY_TRACKER_RULE } from '@shared/factions/treacheryTrackerRule';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
  withTreacheryTracker,
  withTroopDetails,
  withPlanets,
  expectLeaderLane,
  currentSheetWithAFailedReplacement,
  variantMaintainerOutsideTheFactionGroup,
  factionMaintainerOutsideTheVariantGroup,
  DREAMRULES_PATH,
  withAChildVariant,
  withABrokenChildVariant,
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
    /* The notice is one line until pressed: its title is the toggle, and the explanation stays shut. */
    const shared = page.getByRole('button', { name: 'Shared by every variant' });
    await expect(shared).toBeVisible();
    await expect(shared).toHaveAttribute('aria-expanded', 'false');
    await expect(page.queryByRole('region', { name: 'Shared by every variant' })).toBeNull();
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
    /* The notice opens to say whose the other chapters are, and the story leaves it shut, as a reader first meets it. */
    const shared = page.getByRole('button', { name: 'Shared by every variant' });
    await userEvent.click(shared);
    /* The panel opens with a short animation, so wait for the words to show. */
    await waitFor(() =>
      expect(page.getByText(/The rest of the .+ variant is for its own owner and Group to edit\./)).toBeVisible()
    );
    await userEvent.click(shared);
    await expect(shared).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(page.queryByRole('region', { name: 'Shared by every variant' })).toBeNull());
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

const LOAD = { timeout: 30_000 };

/**
 * The editor of a variant with a parent (#2927).
 * Every field the variant may take from its parent says in its own header whether it does.
 * A field that follows the parent keeps the parent's value, read-only, behind one line, and a custom one keeps its controls.
 */
export const EditVariantWithAParent = meta.story({
  args: { path: `${DREAMRULES_PATH}/edit` },
  parameters: { database: withAChildVariant },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('tab', { name: /Rules/ }, LOAD));
    const rules = within(await page.findByRole('tabpanel', { name: /Rules/ }, LOAD));
    const followsParent = await rules.findAllByRole('checkbox', { name: /^Use parent variant for / }, LOAD);
    await expect(followsParent).toHaveLength(5);
    await expect(followsParent.filter((choice) => (choice as HTMLInputElement).checked)).toHaveLength(4);
    const inherited = rules.getByRole('group', { name: 'Starting instructions, from Original, read-only' });
    /* The parent's value stays shut until its line is pressed. */
    const toggle = within(inherited).getByRole('button', {
      name: 'From Original, the parent variant. Read-only here.',
    });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(within(inherited).queryByRole('region')).toBeNull();
    await expect(rules.queryByRole('textbox', { name: 'Starting instructions' })).toBeNull();
    await expect(rules.getByRole('textbox', { name: 'Revival instructions' })).toHaveTextContent('3 troops free.');
  },
});

/**
 * A maintainer of the Faction starts a new variant from the variant page's toolbar (#2927).
 * The popover takes the name, shows the address it gives, and offers each live variant as the one parent, or none.
 */
export const DetailCreateVariant = meta.story({
  args: { path: DREAMRULES_PATH },
  parameters: { database: withAChildVariant },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Create variant' }, LOAD));
    const form = within(await page.findByRole('form', { name: 'Create variant' }, LOAD));
    await userEvent.type(form.getByRole('textbox', { name: 'Variant name' }), 'Tournament');
    await expect(form.getByText('/factions/house-atreides-tournament')).toBeVisible();
    const parents = within(form.getByRole('group', { name: 'Parent variant' }));
    await expect(parents.getAllByRole('radio').map((radio) => radio.parentElement?.parentElement?.textContent)).toEqual(
      ['No parent', 'Original', 'Dreamrules']
    );
    await expect(parents.getByRole('radio', { name: 'Dreamrules' })).toBeChecked();
    await expect(form.getByText(/Starts with all 15 fields using Dreamrules\./)).toBeVisible();
  },
});

/**
 * A parent's change left the variant with fields a save would refuse (#2908), and its troops have no battle strengths yet.
 * Those who may edit the variant see every problem in one notice on top of its page: one line until it is pressed.
 * The way to the editor is the toolbar's Edit, so the notice does not repeat it.
 */
export const DetailVariantWithProblems = meta.story({
  args: { path: DREAMRULES_PATH },
  parameters: { database: withABrokenChildVariant },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const toggle = await page.findByRole('button', { name: '4 problems to fix in this variant' }, LOAD);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.queryByRole('list', { name: 'Problems' })).toBeNull();
    /* The badge is for readers who cannot fix anything; an editor has the notice. */
    await expect(page.queryByText('Not ready for play')).toBeNull();
    await expect(page.queryByRole('link', { name: 'Fix in the editor' })).toBeNull();
  },
});
