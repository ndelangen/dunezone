import { createContext } from 'react';
import type { ReactNode } from 'react';

/** One player as the compass's chat bar, tiles, chat windows and faction information see them. */
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
  /** The removal vote standing against them, if any. */
  vote?: string;
}>;

/** What the hosted table hands the compass: the players, the table's chat, a chat with one player, one seat's faction, and the phase step. */
export type CompassTable = Readonly<{
  players: readonly CompassPlayer[];
  tableChat: Readonly<{ unread: number }> | null;
  /** The chat with a seat's player, or the table's. */
  chat: (seat: string) => ReactNode;
  /** A seat's faction information, with any vote against its player and any request for the seat. */
  factionInfo: (seat: string) => ReactNode;
  /** Steps to the next phase; null while the header's Next phase button would be disabled, or the stage has none. */
  nextPhase: (() => void) | null;
  /** The viewer's own faction token on the table: which side shows, and turning it over; null without a seat or a token. */
  token: Readonly<{ faceUp: boolean; flip: () => void }> | null;
}>;

export const CompassTableContext = createContext<CompassTable | null>(null);
