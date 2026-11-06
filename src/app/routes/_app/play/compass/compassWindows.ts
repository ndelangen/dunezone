import { createContext } from 'react';

/** What a window's content can bring up beside it: a seat's faction information, or the chat with its player. */
export type CompassWindows = Readonly<{
  factionInfo: (seat: string) => void;
  chat: (seat: string) => void;
}>;

/** The compass's windows as content sees them; null outside a table, as in a panel's own story. */
export const CompassWindowsContext = createContext<CompassWindows | null>(null);
