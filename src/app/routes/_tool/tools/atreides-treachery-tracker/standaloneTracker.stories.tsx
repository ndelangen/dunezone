import preview from '@sb/preview';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';
import { DREAMRULES_DECK, FACTIONS, midGameTracker } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { playGame, startGame } from './standaloneGame';
import type { StandaloneGame } from './standaloneGame';
import { TrackerGame } from './StandaloneTracker';
import { StorySetup } from './standaloneTracker.stories.fixture';

const DECKS = [{ id: 'dreamrules', name: 'Dreamrules Treachery' }];

/* The story game in turn 2, mid-auction, as a phone at a physical table keeps it. */
function midGame(): StandaloneGame {
  return { ...startGame(DECKS, FACTIONS, DREAMRULES_DECK), turn: 2, state: midGameTracker() };
}

/* A game the story can play: every action and turn change lands, as the page's saved game would. */
function PlayableGame() {
  const [game, setGame] = useState(midGame);
  return (
    <TrackerGame
      game={game}
      onAction={(action) => setGame((was) => playGame(was, action))}
      onTurn={(turn) => setGame((was) => ({ ...was, turn }))}
      onClear={() => setGame(startGame(DECKS, FACTIONS, DREAMRULES_DECK))}
    />
  );
}

const meta = preview.meta({
  title: 'Tools/Treachery tracker',
  /* Full width, as the page fills the phone. */
  parameters: { database: db(() => {}), layout: 'fullscreen' },
  /* A phone's gutter, as the page gives it. */
  decorators: [
    (Story) => (
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    ),
  ],
  globals: { viewport: { value: 'appMobile' } },
});

/** A game in turn 2 at a physical table: the turn, the decks and the card on bid stay pinned while the auction, hands and deck scroll beneath. */
export const Tracker = meta.story({
  render: () => <PlayableGame />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'On bid' })).toBeVisible();
  },
});

/** Setting up: the Treachery decks tracked together, the Dreamrules deck to start with, a sheet that adds any other deck, and the factions at the table in seat order. */
export const SetUp = meta.story({
  render: () => <StorySetup />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Remove Dreamrules Treachery' })).toBeVisible();
    await expect(canvas.getByText('A Treachery deck of 45 cards, 33 different.')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: /^Remove (?!Dreamrules)/ })).toHaveLength(6);
  },
});

/** The moment the decks are picked every card picture is fetched, and the bar fills as they come in; the game starts once they are all in. */
export const FetchingTheCards = meta.story({
  render: () => <StorySetup fetched={{ done: 12, total: 33 }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('progressbar', { name: 'Fetching the card pictures' })).toBeVisible();
  },
});

/** With no deck ticked there is nothing to track, and Start says so. */
export const NoDeck = meta.story({
  render: () => <StorySetup deck={{ status: 'missing', reason: 'Pick at least one Treachery deck.' }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Start tracking' })).toHaveAccessibleDescription(
      'Pick at least one Treachery deck.'
    );
  },
});
