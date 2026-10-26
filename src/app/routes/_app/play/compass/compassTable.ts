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
  /** The removal vote standing against them, if any: their window follows it when they trade seats. */
  vote?: string;
}>;

/** What the hosted table hands the compass: the players, the table's chat, one player's window, and the phase step. */
export type CompassTable = Readonly<{
  players: readonly CompassPlayer[];
  tableChat: Readonly<{ unread: number }> | null;
  render: (seat: string, tab: 'public' | 'conversation') => ReactNode;
  /** Steps to the next phase; null while the header's Next phase button would be disabled, or the stage has none. */
  nextPhase: (() => void) | null;
  /** The viewer's own faction token on the table: which side shows, and turning it over; null without a seat or a token. */
  token: Readonly<{ faceUp: boolean; flip: () => void }> | null;
  /** The bidder's raise by one, lowering (null unless the viewer raised this turn) and pass, while it points at the viewer. */
  bidding?: Readonly<{ raise: () => void; lower: (() => void) | null; pass: () => void }> | null;
}>;

export const CompassTableContext = createContext<CompassTable | null>(null);
