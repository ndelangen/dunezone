import type { FunctionReturnType } from 'convex/server';
import { useEffect, useState } from 'react';

import { db } from '@db/core';

import { api } from '../../../convex/_generated/api';

/** A deck of Treachery cards the tracker offers. */
export type TreacheryDeckChoice = FunctionReturnType<typeof api.treacheryTrackerTool.decks>[number];

/**
 * Every deck of Treachery cards the standalone tracker lets a player pick, a Ruleset's first.
 * Undefined while they load.
 * Read once, not followed: the list walks every deck, the setup is open only briefly, and an edit to a deck elsewhere need not reach it.
 * A read that fails reads as no decks yet, so the setup says so rather than waiting forever.
 */
export function useTreacheryDeckChoices(): readonly TreacheryDeckChoice[] | undefined {
  const [decks, setDecks] = useState<readonly TreacheryDeckChoice[] | undefined>(undefined);
  useEffect(() => {
    let current = true;
    db.query(api.treacheryTrackerTool.decks, {}, { hold: false }).then(
      (answer) => current && setDecks(answer),
      () => current && setDecks([])
    );
    return () => {
      current = false;
    };
  }, []);
  return decks;
}
