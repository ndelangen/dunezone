import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, fireEvent, userEvent, within } from 'storybook/test';

import { clearStoredGame, seedStoredGame, storyGame } from './_tool/tools/spice-deck/spiceDeck.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/*
 * The spice deck tool on a phone at the table (Norbert, 2026-11-09), as the page at /tools/spice-deck: no app chrome, the decks
 * from the catalogue. The spice piles are the buttons: a tap draws the top card, turns it over on the way and lays it on that pile.
 * The page keeps its game in this browser's storage, so each story seeds the game it opens on, as a reload at the table would.
 */
const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tools/Spice deck',
  args: { path: '/tools/spice-deck' },
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' }, motion: 'on' },
});

const pageOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** Turn 3 of a GF9 game with two spice piles, just after a Spice Blow in which Shai-Hulud came up on both. */
export const Table = meta.story({
  beforeEach: () => seedStoredGame(storyGame(3)),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await expect(await page.findByText('Spice pile A · 4', {}, { timeout: 30_000 })).toBeVisible();
  },
});

/** A new turn: nothing turned yet. A tap on spice pile A flies its card over. */
export const NewTurn = meta.story({
  beforeEach: () => seedStoredGame(storyGame(3, { andNext: true })),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await expect(
      await page.findByRole('button', { name: 'Turn over a card onto spice pile a' }, { timeout: 30_000 })
    ).toBeEnabled();
  },
});

/** One spice pile, the default, on the first turn: a tap turns the top card over and it lands on the pile. */
export const OnePile = meta.story({
  beforeEach: () => seedStoredGame(storyGame(0, { piles: 1 })),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Turn over a card onto spice pile' }, { timeout: 30_000 })
    );
    /* The pile counts the card only once it has landed (0 while it flies), and the flying card leaves the table. */
    await waitForFrame(
      async () => {
        await expect(page.getByText('Spice pile · 1')).toBeVisible();
        await expect(canvasElement.ownerDocument.querySelector('[data-turn]')).toBeNull();
      },
      { timeout: 15_000 }
    );
    const pile = page.getByRole('button', { name: 'Turn over a card onto spice pile' });
    await expect(within(pile).getByRole('img')).toBeVisible();
  },
});

/** Peek: held for two seconds, the next card shows big over everything; a tap hides it again. This game peeks at two. */
export const Peek = meta.story({
  beforeEach: () => seedStoredGame(storyGame(3, { andNext: true, peek: 2 })),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await fireEvent.pointerDown(
      await page.findByRole('button', { name: 'Hold to peek at the next card' }, { timeout: 30_000 })
    );
    /* The peek opens after a two-second hold, a real timer; the bound covers that and a runner starved of frames for several seconds. */
    await waitForFrame(() => expect(page.getByRole('dialog', { name: 'The next spice cards' })).toBeVisible(), {
      timeout: 15_000,
    });
    await expect(page.getByText('The next 2 cards, the next first')).toBeVisible();
    /* A modal: focus is inside it, so the game's buttons behind it cannot be reached. */
    const dialog = page.getByRole('dialog', { name: 'The next spice cards' });
    await expect(dialog).toContainElement(canvasElement.ownerDocument.activeElement as HTMLElement);
    await userEvent.click(page.getByRole('button', { name: 'Hide and put the phone back' }));
    await expect(page.queryByRole('dialog', { name: 'The next spice cards' })).not.toBeInTheDocument();
  },
});

/**
 * Settings > Pick another deck opens the deck picker with the game kept: the ruleset whose deck the table plays with, how many spice piles, and how many cards a peek shows.
 * Backing out returns to the game.
 */
export const PickAnotherDeck = meta.story({
  beforeEach: () => seedStoredGame(storyGame(3)),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Game settings' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Pick another deck' }));
    await expect(await page.findByText('Pick the deck your table plays with')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Back to the game' }));
    await expect(await page.findByText('Spice pile A · 4')).toBeVisible();
  },
});

/** Before a game: the picker lists the catalogue's rulesets that slot a spice deck, read from the database. */
export const PickADeck = meta.story({
  beforeEach: clearStoredGame,
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await expect(await page.findByText('Pick the deck your table plays with', {}, { timeout: 30_000 })).toBeVisible();
    await expect(page.getByLabelText('How many spice piles?')).toHaveValue('1');
    /* The Storybook database slots no spice deck in any ruleset, so the list says so; the Pick another deck story covers the way back to a game. */
    await expect(await page.findByText('No Ruleset has a spice deck yet.', {}, { timeout: 30_000 })).toBeVisible();
  },
});
