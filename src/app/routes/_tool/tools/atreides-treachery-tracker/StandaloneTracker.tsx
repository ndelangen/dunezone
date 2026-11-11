import { Text } from '@mantine/core';
import { FetchProgress } from '@ui/content/FetchProgress';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { TouchSurface } from '@ui/surface/TouchSheet';
import { Minus, Play, Plus, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { AuctionTracker } from '@app/widgets/treachery-tracker/AuctionTracker';
import type { TrackerSection } from '@app/widgets/treachery-tracker/AuctionTracker';
import type { CardDef, TrackerAction } from '@app/widgets/treachery-tracker/tracker';

import type { StandaloneGame } from './standaloneGame';
import styles from './StandaloneTracker.module.css';
import { TrackerConfigPanel } from './TrackerConfig';
import type { DeckOption, FactionSearch, TrackerConfig } from './TrackerConfig';

/*
 * The Treachery tracker on its own, for a game at a physical table (#2795): set up from any Treachery decks, then tracked on a phone.
 * Nothing here reads the server; the page hands it the decks, the picked ones' cards, how many card pictures are in, the factions, and the saved game.
 */

/** The picked decks' cards together, as the setup sees them. */
export type SetupDeck =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; defs: readonly CardDef[] }>
  | Readonly<{ status: 'missing'; reason: string }>;

/** How many of the picked decks' card pictures are in. */
export type Fetched = Readonly<{ done: number; total: number }>;

/** The setup: the decks, the factions at the table in seat order, and the start, once every card picture is in. */
export function TrackerSetup({
  decks,
  deck,
  fetched,
  config,
  onChange,
  onStart,
  search,
}: Readonly<{
  /** Every deck the tracker can copy; undefined while they load. */
  decks: readonly DeckOption[] | undefined;
  deck: SetupDeck;
  /** The picked decks' card pictures fetched so far, so a table on a slow connection sees how far along it is. */
  fetched: Fetched;
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
  onStart: () => void;
  search: FactionSearch;
}>) {
  const fetching = deck.status === 'ready' && fetched.done < fetched.total;
  return (
    <TouchSurface>
      <div className={styles.setup}>
        <TrackerConfigPanel decks={decks} config={config} onChange={onChange} search={search} />
        <div className={styles.start}>
          <DeckLine deck={deck} fetched={fetched} />
          {fetching ? (
            <FetchProgress label="Fetching the card pictures" done={fetched.done} total={fetched.total} />
          ) : null}
          <LabeledAction
            emphasis="strong"
            size="lg"
            icon={<Play size={17} />}
            disabledReason={startReason(config, deck, fetching)}
            onClick={onStart}
          >
            Start tracking
          </LabeledAction>
        </div>
      </div>
    </TouchSurface>
  );
}

/* Why the game cannot start yet, or undefined once it can: every card picture is in before it does, as the spice deck waits. */
function startReason(config: TrackerConfig, deck: SetupDeck, fetching: boolean): string | undefined {
  if (config.decks.length === 0) {
    return 'Pick at least one Treachery deck.';
  }
  if (deck.status === 'loading' || config.seats === undefined) {
    return 'The decks are still loading.';
  }
  if (deck.status === 'missing') {
    return deck.reason;
  }
  if (config.seats.length < 2) {
    return 'Seat at least two factions.';
  }
  return fetching ? 'The card pictures are still coming in.' : undefined;
}

/* What the tracker will start with: the decks' size and how many card pictures are in, or why there are no cards. */
function DeckLine({ deck, fetched }: Readonly<{ deck: SetupDeck; fetched: Fetched }>) {
  if (deck.status !== 'ready') {
    return (
      <Text size="sm" className={styles.dim}>
        {deck.status === 'loading' ? 'Reading the Treachery decks…' : deck.reason}
      </Text>
    );
  }
  const copies = deck.defs.reduce((sum, def) => sum + def.count, 0);
  const size = `A Treachery deck of ${copies} cards, ${deck.defs.length} different.`;
  return (
    <Text size="sm" className={styles.dim}>
      {fetched.done < fetched.total ? `${size} Fetching the cards · ${fetched.done} of ${fetched.total}` : size}
    </Text>
  );
}

/**
 * A game being tracked, on a phone held in one hand.
 * The card on bid and the turn sit at the foot of the screen, under the thumb.
 * The auction, hands and deck scroll above them.
 * The decks and the clear action sit at the top, out of the thumb's way.
 * The screen stays on while the game is open, so the phone is ready when it is picked up.
 */
export function TrackerGame({
  game,
  onAction,
  onTurn,
  onClear,
}: Readonly<{
  game: StandaloneGame;
  onAction: (action: TrackerAction) => void;
  onTurn: (turn: number) => void;
  onClear: () => void;
}>) {
  useScreenAwake();
  const tracker = (sections?: readonly TrackerSection[]) => (
    <AuctionTracker
      factions={game.factions}
      state={game.state}
      onAction={onAction}
      tableTurn={game.turn}
      sections={sections}
    />
  );
  return (
    <TouchSurface>
      <div className={styles.game}>
        <header className={styles.bar}>
          <Text size="sm" className={styles.ruleset} truncate>
            {game.decks.map((deck) => deck.name).join(' + ')}
          </Text>
          <HoldAction
            label="Clear this game"
            verb="clear"
            size="2.75rem"
            icon={<RotateCcw size={18} />}
            onConfirm={onClear}
          />
        </header>
        <div className={styles.scroll}>{tracker(['auctions', 'hands', 'deck'])}</div>
        <div className={styles.dock}>
          {tracker(['bid'])}
          <div className={styles.turn}>
            <IconAction
              label="Turn before"
              icon={<Minus size={20} />}
              size="xl"
              emphasis="standard"
              disabledReason={game.turn > 1 ? undefined : 'This is the first turn.'}
              onClick={() => onTurn(game.turn - 1)}
            />
            <Text fw={700} size="lg" className={styles.turnLabel} aria-live="polite">
              {`Turn ${game.turn}`}
            </Text>
            <IconAction
              label="Next turn"
              icon={<Plus size={20} />}
              size="xl"
              emphasis="standard"
              onClick={() => onTurn(game.turn + 1)}
            />
          </div>
        </div>
      </div>
    </TouchSurface>
  );
}

/* Keeps the screen on while the game is open, and asks again when the page comes back into view, since the browser lets go of it whenever the page is hidden. */
function useScreenAwake() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const ask = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) {
        return;
      }
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (gone) {
            void sentinel.release();
          } else {
            lock = sentinel;
          }
        },
        () => {
          /* Low battery or a browser without it: the screen dims as usual. */
        }
      );
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release();
    };
  }, []);
}
