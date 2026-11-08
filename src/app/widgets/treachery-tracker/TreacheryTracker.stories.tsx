import preview from '@sb/preview';
import { useReducer } from 'react';
import type { ComponentType } from 'react';
import { expect } from 'storybook/test';

import { panelMeta } from '../../routes/_app/play/panels/PanelWindow.stories.fixture';
import { AuctionTracker } from './AuctionTracker';
import { ColumnsTracker } from './ColumnsTracker';
import { DeckSheetTracker } from './DeckSheetTracker';
import { LedgerTracker } from './LedgerTracker';
import { OddsTracker } from './OddsTracker';
import { trackerReducer } from './tracker';
import type { TrackerState } from './tracker';
import { FACTIONS, midGameTracker } from './tracker.stories.fixture';
import type { TrackerViewProps } from './TrackerParts';

/*
 * Prototypes of the Atreides Treachery tracker, one option per story, each in a pinned compass slot as the Panel would sit in Play.
 * Every option reads the same knowledge from the same game: turn 2 of a six-faction Dreamrules game, with Hunter Seeker up for bid.
 * Each one is live: assign, discard and give cards to see how it handles a game.
 */
const meta = preview.meta({
  ...panelMeta({
    key: 'treachery-tracker',
    label: 'Treachery tracker',
    topic: 'cards',
    description: 'Track the Treachery cards you saw, and who holds them. Only you see it.',
  }),
  title: 'Prototypes',
});

function Live({
  view: View,
  initial,
}: Readonly<{ view: ComponentType<TrackerViewProps>; initial: () => TrackerState }>) {
  const [state, dispatch] = useReducer(trackerReducer, undefined, initial);
  return <View factions={FACTIONS} state={state} onAction={dispatch} />;
}

/** A: a column per faction under its token, a line per card, and a plus at the foot; the cards you saw run along the top. */
export const Columns = meta.story({
  render: () => <Live view={ColumnsTracker} initial={midGameTracker} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Hunter Seeker: who took it?' })).toBeVisible();
  },
});

/** B: the paper Atreides sheet, alive: a row per card, a column per faction plus deck and discard, a dot per copy. */
export const Ledger = meta.story({
  render: () => <Live view={LedgerTracker} initial={midGameTracker} />,
});

/** C: the card on bid fills the top as its own banner, and one click on a token records who won it. */
export const AuctionFirst = meta.story({
  render: () => <Live view={AuctionTracker} initial={midGameTracker} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Fremen won Hunter Seeker' })).toBeVisible();
  },
});

/** D: what matters in a battle, per faction: the weapons and defenses Atreides knows of, and the odds among its unknown cards. */
export const BattleOdds = meta.story({
  render: () => <Live view={OddsTracker} initial={midGameTracker} />,
});

/** E: the tracker is the deck: every physical card one glyph, wearing its holder's token, with unknown counts along the top. */
export const DeckSheet = meta.story({
  render: () => <Live view={DeckSheetTracker} initial={midGameTracker} />,
});
