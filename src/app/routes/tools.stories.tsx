import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { DREAMRULES_DECK, FACTIONS, midGameTracker } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { TOOLS } from './_app/tools/tools';
import { savedGame, startGame } from './_tool/tools/atreides-treachery-tracker/standaloneGame';
import { clearStoredWheel } from './_tool/tools/battle-wheel/battleWheel.stories.fixture';
import { clearStoredGame } from './_tool/tools/spice-deck/spiceDeck.stories.fixture';
import { expectWithinWidth } from './pagePlay';
import { findTitledPage } from './site.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tools',
  args: { path: '/tools' },
});

/** Every tool as a tutorial-style tile in rows by when a table reaches for it; a tool not yet built says coming soon and opens its placeholder page. */
export const Catalogue = meta.story({
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Tools$/);
    await expect(page.getByRole('list', { name: 'Before the game' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'During the game' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Make and export' })).toBeVisible();
    await expect(page.getAllByRole('listitem')).toHaveLength(TOOLS.length);
    await expect(page.getAllByText('Coming soon')).toHaveLength(TOOLS.filter((tool) => !tool.built).length);
    /* A built tool's link also says it opens in a new tab, so its name is matched from the start. */
    await expect(page.getByRole('link', { name: /^Treachery tracker/ })).toHaveAttribute(
      'href',
      '/tools/atreides-treachery-tracker'
    );
    for (const tool of TOOLS.filter((entry) => entry.built)) {
      const link = page.getByRole('link', { name: `${tool.title} (opens in a new tab)` });
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener');
    }
    await expect(page.getByRole('link', { name: 'Spice deck (opens in a new tab)' })).toHaveAttribute(
      'href',
      '/tools/spice-deck'
    );
  },
});

/** The catalogue at phone width, where the tools are used: one tile across, nothing pushing the page sideways. */
export const CataloguePhone = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Tools$/);
    await expectWithinWidth(canvasElement, page.getAllByRole('listitem'));
  },
});

/** A planned tool's page: what it will do, a way back to every tool, and where to follow it or share an idea. */
export const ComingSoon = meta.story({
  args: { path: '/tools/faction-draft' },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Faction draft$/);
    await expect(page.getByRole('heading', { name: 'What it will do' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All tools' })).toHaveAttribute('href', '/tools');
  },
});

/** The Treachery tracker, the first built tool, on a phone and without the app around it: the Ruleset and its factions to set up, then Start tracking. */
export const TreacheryTracker = meta.story({
  args: { path: '/tools/atreides-treachery-tracker' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Treachery tracker$/);
    await expect(page.findByRole('button', { name: 'Start tracking' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('banner')).toBeNull();
    await expect(page.queryByRole('contentinfo')).toBeNull();
  },
});

/** The Treachery tracker in the middle of a real game: turn 2 of a Dreamrules game kept on the phone, as a player reopening the page finds it. */
export const TreacheryTrackerInPlay = meta.story({
  args: { path: '/tools/atreides-treachery-tracker' },
  globals: { viewport: { value: 'appMobile' } },
  beforeEach: () => {
    savedGame.set({
      ...startGame([{ id: 'dreamrules', name: 'Dreamrules' }], FACTIONS, DREAMRULES_DECK),
      turn: 2,
      state: midGameTracker(),
    });
    return () => savedGame.set(null);
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('region', { name: 'On bid' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Next turn' })).toBeVisible();
  },
});

/** The same page at phone width. */
export const ComingSoonPhone = meta.story({
  args: { path: '/tools/faction-draft' },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = await findTitledPage(canvasElement, /^Faction draft$/);
    await expectWithinWidth(canvasElement, [page.getByRole('link', { name: 'Share an idea' })]);
  },
});

/** The spice deck, the first tool built: at its own address, offering the spice deck of every Ruleset in the catalogue. */
export const SpiceDeck = meta.story({
  args: { path: '/tools/spice-deck' },
  /* A game left by another story would open the table instead of the picker. */
  beforeEach: clearStoredGame,
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { level: 1, name: 'Spice deck' }, { timeout: 30_000 })
    ).resolves.toBeInTheDocument();
    await expect(page.findByText('Pick the deck your table plays with')).resolves.toBeVisible();
  },
});

/** The battle wheel: at its own address, a first visit opens on picking the faction, with a search for any on Dune Zone. */
export const BattleWheel = meta.story({
  args: { path: '/tools/battle-wheel' },
  /* A wheel left by another story would open that battle instead of the picker. */
  beforeEach: clearStoredWheel,
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { level: 1, name: 'Battle wheel' }, { timeout: 30_000 })
    ).resolves.toBeInTheDocument();
    await expect(page.findByText('Any faction on Dune Zone', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('searchbox', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(page.queryByText('Loading the factions…')).not.toBeInTheDocument(), { timeout: 30_000 });
  },
});
