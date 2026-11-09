import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, fireEvent, userEvent, within } from 'storybook/test';

import { loadStoryDeck, STORY_DECKS, storyGame } from './spiceDeck.stories.fixture';
import { SpiceDeckTool } from './SpiceDeckTool';

/*
 * The spice deck tool on a phone at the table (Norbert, 2026-11-09). The spice piles are the buttons: a tap draws the top
 * card, turns it over on the way and lays it on that pile. Everything is live, and the game is kept in this browser's
 * storage, so a reload carries on (Settings > New game starts over).
 */
const meta = preview.meta({
  title: 'Tools/Spice deck',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' }, motion: 'on' },
});

/** Turn 3 of a GF9 game with two spice piles, just after a Spice Blow in which Shai-Hulud came up on both. */
export const Table = meta.story({
  render: () => (
    <SpiceDeckTool
      storageKey="spice-deck-story-table"
      initial={storyGame(3)}
      decks={STORY_DECKS}
      loadDeck={loadStoryDeck}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Spice pile A · 4')).toBeVisible();
  },
});

/** A new turn: nothing turned yet. A tap on spice pile A flies its card over. */
export const NewTurn = meta.story({
  render: () => (
    <SpiceDeckTool
      storageKey="spice-deck-story-new-turn"
      initial={storyGame(3, { andNext: true })}
      decks={STORY_DECKS}
      loadDeck={loadStoryDeck}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Turn over a card onto spice pile a' })).toBeEnabled();
  },
});

/** One spice pile, the default, on the first turn. */
export const OnePile = meta.story({
  render: () => (
    <SpiceDeckTool
      storageKey="spice-deck-story-one-pile"
      initial={storyGame(0, { piles: 1 })}
      decks={STORY_DECKS}
      loadDeck={loadStoryDeck}
    />
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Turn over a card onto spice pile' }));
    await expect(canvas.getByText(/left · \d+% Shai-Hulud/)).toBeVisible();
  },
});

/** Peek: held for two seconds, the next card shows big over everything; a tap hides it again. This game peeks at two. */
export const Peek = meta.story({
  render: () => (
    <SpiceDeckTool
      storageKey="spice-deck-story-peek"
      initial={storyGame(3, { andNext: true, peek: 2 })}
      decks={STORY_DECKS}
      loadDeck={loadStoryDeck}
    />
  ),
  play: async ({ canvas, canvasElement }) => {
    await fireEvent.pointerDown(canvas.getByRole('button', { name: 'Hold to peek at the next card' }));
    const page = within(canvasElement.ownerDocument.body);
    /* The peek opens after a two-second hold, a real timer; the bound covers that and a runner starved of frames for several seconds. */
    await waitForFrame(() => expect(page.getByRole('dialog', { name: 'The next spice cards' })).toBeVisible(), {
      timeout: 15_000,
    });
    await expect(page.getByText('The next 2 cards, the next first')).toBeVisible();
  },
});

/** Before a game: the ruleset whose deck the table plays with, how many spice piles, and how many cards a peek shows. Picking one starts the game. */
export const PickADeck = meta.story({
  /* Picking a deck starts a game in this browser's storage; each visit starts from the picker again. */
  beforeEach: () => {
    window.localStorage.removeItem('spice-deck-story-picker');
  },
  render: () => <SpiceDeckTool storageKey="spice-deck-story-picker" decks={STORY_DECKS} loadDeck={loadStoryDeck} />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: /KISS/ }));
    await expect(await canvas.findByRole('button', { name: 'Turn over a card onto spice pile' })).toBeEnabled();
  },
});
