import preview from '@sb/preview';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

import { STORY_DECKS, storyGame } from './spiceDeck.stories.fixture';
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
  render: () => <SpiceDeckTool storageKey="spice-deck-story-table" initial={storyGame(3)} decks={STORY_DECKS} />,
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
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Turn over a card onto spice pile a' })).toBeEnabled();
  },
});

/** One spice pile, the default, on the first turn. */
export const OnePile = meta.story({
  render: () => (
    <SpiceDeckTool storageKey="spice-deck-story-one-pile" initial={storyGame(0, { piles: 1 })} decks={STORY_DECKS} />
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
    />
  ),
  play: async ({ canvas, canvasElement }) => {
    await fireEvent.pointerDown(canvas.getByRole('button', { name: 'Hold to peek at the next card' }));
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('dialog', { name: 'The next spice cards' })).toBeVisible(), {
      timeout: 4000,
    });
    await expect(page.getByText('The next 2 cards, the next first')).toBeVisible();
  },
});

/** Before a game: the deck the table plays with, how many spice piles, and how many cards a peek shows. */
export const PickADeck = meta.story({
  render: () => <SpiceDeckTool storageKey="spice-deck-story-picker" decks={STORY_DECKS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /GF9 Spice Deck/ })).toBeVisible();
  },
});
