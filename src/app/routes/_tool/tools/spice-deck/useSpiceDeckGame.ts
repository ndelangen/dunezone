import { useCallback, useEffect, useState } from 'react';

import type { Random, SpiceDeckGame } from './spiceDeck';

/*
 * The game as the page keeps it: in this browser's own storage, so a phone at the table can sleep, reload or lose signal
 * and pick up where it was. Nothing goes to the server. Every step can be taken back, as far back as the game began.
 */

/** What the last step did: a card turned over, a card set aside, or anything else (a new turn, a step taken back). The page animates from it. */
type StepKind = 'deal' | 'aside' | 'other';
type LastStep = Readonly<{ id: number; kind: StepKind }>;

type Saved = Readonly<{ game: SpiceDeckGame; undo: readonly SpiceDeckGame[]; last?: LastStep }>;

/* Earlier games mostly share the current one's deck, so that deck is stored once, with the current game; a game from before another deck was picked keeps its own. */
type StoredStep = Omit<SpiceDeckGame, 'deck'>;
type Stored = Readonly<{ game: SpiceDeckGame; undo: readonly (StoredStep | SpiceDeckGame)[] }>;

/* A short history still lets the table take back a slip when the full one no longer fits the browser's storage. */
const FALLBACK_UNDO = 20;

/* Far more steps than a game turns cards, and still small: a game is a few hundred short strings. */
const UNDO_DEPTH = 200;

function read(key: string): Saved | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    const stored = raw ? (JSON.parse(raw) as Stored) : undefined;
    if (stored?.game?.version !== 1) {
      return undefined;
    }
    const { deck } = stored.game;
    return { game: stored.game, undo: stored.undo.map((step) => ({ deck, ...step })) };
  } catch {
    return undefined;
  }
}

/* A ruleset's deck can change between two games of it, so an earlier game sheds its deck only when it is the very same one. */
function stored(saved: Saved, depth: number): Stored {
  const { deck } = saved.game;
  const deckText = JSON.stringify(deck);
  const sameDeck = (other: SpiceDeckGame['deck']) => other === deck || JSON.stringify(other) === deckText;
  return {
    game: saved.game,
    undo: saved.undo.slice(-depth).map((step) => {
      if (!sameDeck(step.deck)) {
        return step;
      }
      const { deck: _deck, ...rest } = step;
      return rest;
    }),
  };
}

function write(key: string, saved: Saved | undefined) {
  try {
    if (!saved) {
      window.localStorage.removeItem(key);
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(stored(saved, UNDO_DEPTH)));
    } catch {
      window.localStorage.setItem(key, JSON.stringify(stored(saved, FALLBACK_UNDO)));
    }
  } catch {
    /* Private windows and full storage still play; the game just does not survive a reload, and the stale one is dropped. */
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Storage is not there at all. */
    }
  }
}

const cryptoRandom: Random = () => {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 2 ** 32;
};

/* The game moved on to `game`, the one before it kept a step back; a step that changed nothing is no step. */
function stepTo(current: Saved, game: SpiceDeckGame, kind: StepKind): Saved {
  if (game === current.game) {
    return current;
  }
  return { game, undo: [...current.undo, current.game].slice(-UNDO_DEPTH), last: nextStep(current, kind) };
}

/* The game one step back, if there is one. */
function stepBack(current: Saved | undefined): Saved | undefined {
  const previous = current?.undo.at(-1);
  if (!current || !previous) {
    return current;
  }
  return { game: previous, undo: current.undo.slice(0, -1), last: nextStep(current, 'other') };
}

const nextStep = (current: Saved, kind: StepKind): LastStep => ({ id: (current.last?.id ?? 0) + 1, kind });

/** Where this browser keeps the spice deck tool's game. */
export const SPICE_DECK_STORAGE_KEY = 'dunezone.tools.spice-deck';

export type SpiceDeckSession = Readonly<{
  game: SpiceDeckGame | undefined;
  /** What the last step did, so the page knows what to animate; undefined for the game as it loaded. */
  last: LastStep | undefined;
  /** Runs one step of the game, saying what kind it is; it can be taken back. */
  act: (step: (game: SpiceDeckGame, random: Random) => SpiceDeckGame, kind?: StepKind) => void;
  undo: () => void;
  canUndo: boolean;
  /** Starts a new game, with this deck or another; the game it replaces can be taken back like any step. */
  start: (game: SpiceDeckGame) => void;
  random: Random;
}>;

export function useSpiceDeckGame(storageKey: string, initial?: SpiceDeckGame, random: Random = cryptoRandom) {
  /* The page renders in the browser only, so the stored game is there from the first render. */
  const [saved, setSaved] = useState<Saved | undefined>(
    () => read(storageKey) ?? (initial ? { game: initial, undo: [] } : undefined)
  );
  useEffect(() => {
    write(storageKey, saved);
  }, [storageKey, saved]);

  const act = useCallback<SpiceDeckSession['act']>(
    (step, kind = 'other') =>
      setSaved((current) => (current ? stepTo(current, step(current.game, random), kind) : current)),
    [random]
  );
  const undo = useCallback(() => setSaved(stepBack), []);
  const start = useCallback(
    (game: SpiceDeckGame) => setSaved((current) => (current ? stepTo(current, game, 'other') : { game, undo: [] })),
    []
  );
  return {
    game: saved?.game,
    last: saved?.last,
    act,
    undo,
    canUndo: (saved?.undo.length ?? 0) > 0,
    start,
    random,
  } satisfies SpiceDeckSession;
}
