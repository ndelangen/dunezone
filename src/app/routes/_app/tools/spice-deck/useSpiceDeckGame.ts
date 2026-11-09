import { useCallback, useEffect, useState } from 'react';

import type { Random, SpiceDeckGame } from './spiceDeck';

/*
 * The game as the page keeps it: in this browser's own storage, so a phone at the table can sleep, reload or lose signal
 * and pick up where it was. Nothing goes to the server. Every step can be taken back, as far back as the game began.
 */

type Saved = Readonly<{ game: SpiceDeckGame; undo: readonly SpiceDeckGame[] }>;

/* Far more steps than a game turns cards, and still small: a game is a few hundred short strings. */
const UNDO_DEPTH = 200;

function read(key: string): Saved | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as Saved) : undefined;
    return saved?.game?.version === 1 ? saved : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, saved: Saved | undefined) {
  try {
    if (saved) {
      window.localStorage.setItem(key, JSON.stringify(saved));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* Private windows and full storage still play; the game just does not survive a reload. */
  }
}

const cryptoRandom: Random = () => {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 2 ** 32;
};

export type SpiceDeckSession = Readonly<{
  game: SpiceDeckGame | undefined;
  /** Runs one step of the game; it can be taken back. */
  act: (step: (game: SpiceDeckGame, random: Random) => SpiceDeckGame) => void;
  undo: () => void;
  canUndo: boolean;
  /** Starts over, with a new game or none (back to choosing a deck). */
  start: (game: SpiceDeckGame | undefined) => void;
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
    (step) =>
      setSaved((current) => {
        if (!current) {
          return current;
        }
        const next = step(current.game, random);
        return next === current.game
          ? current
          : { game: next, undo: [...current.undo, current.game].slice(-UNDO_DEPTH) };
      }),
    [random]
  );
  const undo = useCallback(
    () =>
      setSaved((current) =>
        current && current.undo.length > 0 ? { game: current.undo.at(-1)!, undo: current.undo.slice(0, -1) } : current
      ),
    []
  );
  const start = useCallback((game: SpiceDeckGame | undefined) => setSaved(game ? { game, undo: [] } : undefined), []);
  return {
    game: saved?.game,
    act,
    undo,
    canUndo: (saved?.undo.length ?? 0) > 0,
    start,
    random,
  } satisfies SpiceDeckSession;
}
