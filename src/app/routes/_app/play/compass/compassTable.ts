import { createContext } from 'react';
import type { ReactNode } from 'react';

/** One player as the compass's chat bar, tiles and player windows see them. */
export type CompassPlayer = Readonly<{
  seat: string;
  name: string;
  factionName: string | null;
  token: string | null;
  unread: number;
  own: boolean;
  canConverse: boolean;
  attention: boolean;
  ally: boolean;
}>;

/** What the hosted table hands the compass: the players, the table's chat, one player's window, and the phase step. */
export type CompassTable = Readonly<{
  players: readonly CompassPlayer[];
  tableChat: Readonly<{ unread: number }> | null;
  render: (seat: string, tab: 'public' | 'conversation') => ReactNode;
  /** Steps to the next phase; null while the header's Next phase button would be disabled, or the stage has none. */
  nextPhase: (() => void) | null;
}>;

export const CompassTableContext = createContext<CompassTable | null>(null);
