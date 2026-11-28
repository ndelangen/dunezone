import { createContext } from 'react';

/** What a panel's content can bring up beside it: a seat's faction information, or the chat with its player. */
export type CompassPanels = Readonly<{
  factionInfo: (seat: string) => void;
  chat: (seat: string) => void;
}>;

/** The compass's panels as content sees them; null outside a table, as in a panel's own story. */
export const CompassPanelsContext = createContext<CompassPanels | null>(null);
