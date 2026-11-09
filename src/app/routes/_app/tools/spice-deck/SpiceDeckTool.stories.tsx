import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { STORY_DECKS, storyGame } from './spiceDeck.stories.fixture';
import { SpiceDeckTool } from './SpiceDeckTool';
import type { SpiceDeckVariant } from './SpiceDeckTool';

/*
 * The spice deck tool's six looks, for Norbert to pick one (2026-11-09). Every story is a phone at the table in turn 3
 * of a GF9 game, just after a Spice Blow in which Shai-Hulud came up on both piles. Everything is live: the big button
 * turns the next card, and the game is kept in this browser's storage, so a reload carries on (Settings > New game starts over).
 */
const meta = preview.meta({
  title: 'Tools/Spice deck',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'appMobile' } },
});

const variantStory = (variant: SpiceDeckVariant) => {
  const storageKey = `spice-deck-story-${variant}`;
  return {
    render: () => (
      <SpiceDeckTool variant={variant} storageKey={storageKey} initial={storyGame(3)} decks={STORY_DECKS} />
    ),
  };
};

/** A: both discard piles as they would lie on the table, top cards face up, with this turn's blows read out below. */
export const Piles = meta.story({
  ...variantStory('piles'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Pile A · 2')).toBeVisible();
  },
});

/** B: the last blow in letters big enough to read across the table: the amount, the territory, any Shai-Hulud. */
export const Announcer = meta.story({
  ...variantStory('announcer'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Shai-Hulud ×2!')).toBeVisible();
  },
});

/** C: the whole game so far, a turn per section, newest first, each blow with its card. */
export const TurnLog = meta.story({
  ...variantStory('log'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Turn 1')).toBeVisible();
  },
});

/** D: one card at a time, turned over with a flip, and what the table does with it. */
export const CardByCard = meta.story({
  ...variantStory('card-by-card'),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Start turn 4' })).toBeVisible();
  },
});

/** E: what is still face down: how many cards, the chance Shai-Hulud comes next, and which territories can still blow. */
export const Odds = meta.story({
  ...variantStory('odds'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Shai-Hulud next')).toBeVisible();
  },
});

/** F: hands-free. The phone reads every blow aloud and listens for "spice blow", "next turn", "repeat" and "undo". */
export const Voice = meta.story({
  ...variantStory('voice'),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Say “spice blow”/)).toBeVisible();
  },
});

/** Before a game: the deck the table plays with, and the two Spice Blow rules a ruleset may change. */
export const PickADeck = meta.story({
  render: () => <SpiceDeckTool variant="piles" storageKey="spice-deck-story-picker" decks={STORY_DECKS} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /GF9 Spice Deck/ })).toBeVisible();
  },
});
