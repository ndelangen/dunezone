import { Text } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Minus, Play, Plus, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import { AuctionTracker } from './AuctionTracker';
import type { TrackerSection } from './AuctionTracker';
import type { StandaloneGame } from './standaloneGame';
import styles from './StandaloneTracker.module.css';
import type { CardDef, TrackerAction } from './tracker';
import { TrackerConfigPanel } from './TrackerConfig';
import type { TrackerConfig } from './TrackerConfig';
import { TrackerTouch } from './TrackerSurface';

/*
 * The Treachery tracker on its own, for a game at a physical table (#2795): set up from a Ruleset, then tracked on a phone.
 * Nothing here reads the server; the page hands it the Rulesets, the chosen one's deck and factions, and the saved game.
 */

/** The chosen Ruleset's Treachery deck as the setup sees it. */
export type SetupDeck =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; defs: readonly CardDef[] }>
  | Readonly<{ status: 'missing'; reason: string }>;

/**
 * The setup: the Ruleset, its factions playing in seat order, and the start.
 * `factions` is undefined while the Ruleset's factions load.
 */
export function TrackerSetup({
  rulesets,
  factions,
  deck,
  config,
  onChange,
  onStart,
}: Readonly<{
  rulesets: readonly { id: string; name: string }[];
  factions: readonly FactionToken[] | undefined;
  deck: SetupDeck;
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
  onStart: () => void;
}>) {
  const playing = config.order.filter((id) => config.playing.includes(id));
  const reason =
    deck.status === 'loading' || factions === undefined
      ? 'The Ruleset is still loading.'
      : deck.status === 'missing'
        ? deck.reason
        : playing.length < 2
          ? 'Switch on at least two factions.'
          : undefined;
  return (
    <TrackerTouch>
      <div className={styles.setup}>
        <TrackerConfigPanel
          rulesets={rulesets}
          factions={factions ?? []}
          config={factions ? config : { ...config, order: [] }}
          onChange={onChange}
        />
        {factions === undefined ? <Pending>Loading the factions…</Pending> : null}
        <div className={styles.start}>
          <DeckLine deck={deck} />
          <LabeledAction
            emphasis="strong"
            size="lg"
            icon={<Play size={17} />}
            disabledReason={reason}
            onClick={onStart}
          >
            Start tracking
          </LabeledAction>
        </div>
      </div>
    </TrackerTouch>
  );
}

/* What the tracker will start with: the deck's size, or why there is none. */
function DeckLine({ deck }: Readonly<{ deck: SetupDeck }>) {
  if (deck.status === 'loading') {
    return (
      <Text size="sm" className={styles.dim}>
        Reading the Treachery deck…
      </Text>
    );
  }
  if (deck.status === 'missing') {
    return (
      <Text size="sm" className={styles.dim}>
        {deck.reason}
      </Text>
    );
  }
  const copies = deck.defs.reduce((sum, def) => sum + def.count, 0);
  return (
    <Text size="sm" className={styles.dim}>
      {`A Treachery deck of ${copies} cards, ${deck.defs.length} different.`}
    </Text>
  );
}

/**
 * A game being tracked, on a phone held in one hand.
 * The card on bid and the turn sit at the foot of the screen, under the thumb.
 * The auction, hands and deck scroll above them.
 * The Ruleset and the clear action sit at the top, out of the thumb's way.
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
    <TrackerTouch>
      <div className={styles.game}>
        <header className={styles.bar}>
          <Text size="sm" className={styles.ruleset} truncate>
            {game.ruleset.name}
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
    </TrackerTouch>
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
