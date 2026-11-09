import preview from '@sb/preview';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';
import { DREAMRULES_DECK, FACTIONS, midGameTracker } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { playGame, startGame } from './standaloneGame';
import type { StandaloneGame } from './standaloneGame';
import { TrackerGame } from './StandaloneTracker';
import { RULESETS, StorySetup } from './standaloneTracker.stories.fixture';

/* The story game in turn 2, mid-auction, as a phone at a physical table keeps it. */
function midGame(): StandaloneGame {
  return { ...startGame(RULESETS[0]!, FACTIONS, DREAMRULES_DECK), turn: 2, state: midGameTracker() };
}

/* A game the story can play: every action and turn change lands, as the page's saved game would. */
function PlayableGame() {
  const [game, setGame] = useState(midGame);
  return (
    <TrackerGame
      game={game}
      onAction={(action) => setGame((was) => playGame(was, action))}
      onTurn={(turn) => setGame((was) => ({ ...was, turn }))}
      onClear={() => setGame(startGame(RULESETS[0]!, FACTIONS, DREAMRULES_DECK))}
    />
  );
}

const meta = preview.meta({
  title: 'Tools/Treachery tracker',
  parameters: { database: db(() => {}) },
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

/** A game in turn 2 at a physical table: the turn, the Ruleset and the card on bid stay pinned while the auction, hands and deck scroll beneath. */
export const Tracker = meta.story({
  render: () => <PlayableGame />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'On bid' })).toBeVisible();
  },
});

/** Setting up: the Ruleset whose deck is tracked, and the factions at the table in seat order, the base six to start with. */
export const SetUp = meta.story({
  render: () => <StorySetup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('A Treachery deck of 45 cards, 33 different.')).toBeVisible();
    await expect(within(canvasElement).getAllByRole('button', { name: /^Remove / })).toHaveLength(6);
  },
});

/** A Ruleset without a Treachery deck cannot be tracked, and says so. */
export const NoDeck = meta.story({
  render: () => <StorySetup deck={{ status: 'missing', reason: 'This Ruleset has no Treachery deck.' }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Start tracking' })).toHaveAccessibleDescription(
      'This Ruleset has no Treachery deck.'
    );
  },
});
