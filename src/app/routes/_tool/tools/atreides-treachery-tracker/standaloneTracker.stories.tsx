import preview from '@sb/preview';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';
import { playGame, startGame } from '@app/widgets/treachery-tracker/standaloneGame';
import type { StandaloneGame } from '@app/widgets/treachery-tracker/standaloneGame';
import type { SetupDeck } from '@app/widgets/treachery-tracker/StandaloneTracker';
import { TrackerGame, TrackerSetup } from '@app/widgets/treachery-tracker/StandaloneTracker';
import { DREAMRULES_DECK, FACTIONS, midGameTracker } from '@app/widgets/treachery-tracker/tracker.stories.fixture';
import type { FactionSearch, TrackerConfig } from '@app/widgets/treachery-tracker/TrackerConfig';

const RULESETS = [
  { id: 'dreamrules', name: 'Dreamrules' },
  { id: 'classic', name: 'Classic' },
];

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

/* Every faction the story's search knows: the table's six, and two more without a published token yet. */
const MORE_FACTIONS: readonly FactionToken[] = [
  ...FACTIONS,
  { id: 'ixians', name: 'Ixians' },
  { id: 'tleilaxu', name: 'Tleilaxu' },
];

/* The search the page hands the setup, over the story's factions instead of the catalogue. */
const StorySearch: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={MORE_FACTIONS.filter((faction) => faction.name.toLowerCase().includes(query.trim().toLowerCase()))}
      seated={seated}
      status="done"
      onMore={() => {}}
      onPick={onPick}
    />
  );
};

function Setup({ deck, loading }: Readonly<{ deck: SetupDeck; loading?: boolean }>) {
  const [config, setConfig] = useState<TrackerConfig>({ ruleset: 'dreamrules', seats: FACTIONS });
  return (
    <TrackerSetup
      rulesets={RULESETS}
      deck={deck}
      config={loading ? { ...config, seats: undefined } : config}
      onChange={setConfig}
      onStart={() => {}}
      search={StorySearch}
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
  render: () => <Setup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('A Treachery deck of 45 cards, 33 different.')).toBeVisible();
    await expect(within(canvasElement).getAllByRole('button', { name: /^Remove / })).toHaveLength(6);
  },
});

/** Any faction on Dune Zone can sit at the table: Add a faction searches them all, and a faction can be removed again. */
export const AddAFaction = meta.story({
  render: () => <Setup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Emperor' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add a faction' }));
    await expect(await body.findByRole('button', { name: 'House Atreides is at the table' })).toBeDisabled();
    await userEvent.click(body.getByRole('button', { name: 'Add Ixians' }));
    await expect(canvas.getByText('Ixians')).toBeVisible();
    await expect(canvas.queryByText('Emperor')).toBeNull();
    await expect(canvas.getAllByRole('button', { name: /^Remove / })).toHaveLength(6);
  },
});

/** Removing factions down to one: the tracker needs at least two at the table. */
export const TooFewFactions = meta.story({
  render: () => <Setup deck={{ status: 'ready', defs: DREAMRULES_DECK }} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    for (const name of ['House Harkonnen', 'Emperor', 'Spacing Guild', 'Fremen', 'Bene Gesserit']) {
      await userEvent.click(canvas.getByRole('button', { name: `Remove ${name}` }));
    }
    await expect(canvas.getByRole('button', { name: 'Start tracking' })).toHaveAccessibleDescription(
      'Seat at least two factions.'
    );
  },
});

/** A Ruleset without a Treachery deck cannot be tracked, and says so. */
export const NoDeck = meta.story({
  render: () => <Setup deck={{ status: 'missing', reason: 'This Ruleset has no Treachery deck.' }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Start tracking' })).toHaveAccessibleDescription(
      'This Ruleset has no Treachery deck.'
    );
  },
});
