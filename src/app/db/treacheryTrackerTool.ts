import type { FunctionReturnType } from 'convex/server';

import { useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

/** A deck of Treachery cards the tracker offers. */
export type TreacheryDeckChoice = FunctionReturnType<typeof api.treacheryTrackerTool.decks>[number];

/**
 * Every deck of Treachery cards the standalone tracker lets a player pick, a Ruleset's first;
 * undefined while they load.
 * Not held warm: only the setup reads it, and a game in play holds no catalogue subscription.
 */
export function useTreacheryDeckChoices(): readonly TreacheryDeckChoice[] | undefined {
  return useLiveQuery(api.treacheryTrackerTool.decks, {}, { hold: false });
}
