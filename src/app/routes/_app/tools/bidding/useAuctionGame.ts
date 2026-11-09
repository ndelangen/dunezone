import { BiddingRefusal } from '@shared/play/bidding';
import { useCallback, useEffect, useState } from 'react';

import type { AuctionGame } from './auction';

/*
 * The auction as a tool keeps it: in this browser's storage, so a phone or tablet on the table can sleep or reload and
 * carry on where it was. Nothing goes to the server. Every step can be taken back, as the spice deck's can.
 */

type Saved = Readonly<{ game: AuctionGame; undo: readonly AuctionGame[] }>;

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
    /* Private windows and full storage still play; the auction just does not survive a reload. */
  }
}

export type AuctionSession = Readonly<{
  game: AuctionGame;
  /** Runs one step; a step the rules refuse leaves the game as it was and says why. */
  act: (step: (game: AuctionGame) => AuctionGame) => string | undefined;
  undo: () => void;
  canUndo: boolean;
  /** Starts over with the given game. */
  restart: (game: AuctionGame) => void;
  /** The last refusal, until the next step. */
  refusal: string | undefined;
}>;

export function useAuctionGame(storageKey: string, initial: AuctionGame): AuctionSession {
  const [saved, setSaved] = useState<Saved>(() => read(storageKey) ?? { game: initial, undo: [] });
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  useEffect(() => {
    write(storageKey, saved);
  }, [storageKey, saved]);

  const act = useCallback<AuctionSession['act']>(
    (step) => {
      let next: AuctionGame;
      try {
        next = step(saved.game);
      } catch (error) {
        if (error instanceof BiddingRefusal) {
          setRefusal(error.message);
          return error.message;
        }
        throw error;
      }
      setRefusal(undefined);
      if (next !== saved.game) {
        setSaved({ game: next, undo: [...saved.undo, saved.game].slice(-UNDO_DEPTH) });
      }
      return undefined;
    },
    [saved]
  );
  const undo = useCallback(() => {
    setRefusal(undefined);
    setSaved((current) =>
      current.undo.length > 0 ? { game: current.undo.at(-1)!, undo: current.undo.slice(0, -1) } : current
    );
  }, []);
  const restart = useCallback((game: AuctionGame) => {
    setRefusal(undefined);
    setSaved({ game, undo: [] });
  }, []);
  return { game: saved.game, act, undo, canUndo: saved.undo.length > 0, restart, refusal };
}
