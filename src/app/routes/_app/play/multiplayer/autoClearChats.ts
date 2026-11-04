import { tableProgressFor } from '@shared/play/phases';
import { reviewRunning } from '@shared/play/review';
import { useEffect, useSyncExternalStore } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { viewerChoice } from '../../../../widgets/tabletop/viewerPreference';

/*
 * Whether this viewer's chats clear themselves at the start of each turn (#2674): off unless they turn it on in the game menu.
 * Kept per browser beside the board's look; each clear is logged as one by hand is.
 */
const autoClear = viewerChoice<boolean>('dunezone-chat-auto-clear', {
  parse: (stored) => stored === 'on',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: false,
});

export const setAutoClearChats = autoClear.set;
/** Whether this viewer's chats clear at the start of each turn. */
export const useAutoClearChats = autoClear.use;

/* The turn this browser last saw in a game, so a turn that began while the tab was shut still clears once it is back. */
const seenKey = (game: string) => `dunezone-chat-auto-clear-turn:${game}`;
function readSeen(game: string): number | undefined {
  try {
    const stored = Number(localStorage.getItem(seenKey(game)));
    return Number.isInteger(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}
function writeSeen(game: string, turn: number) {
  try {
    localStorage.setItem(seenKey(game), String(turn));
  } catch {
    /* Without storage only the turns this page sees begin clear. */
  }
}

/** The live table's turn, or undefined outside play and while looking back at history or a recall. */
export function liveTurn(table: TableProjection): number | undefined {
  const { snapshot } = table;
  if (snapshot.stage !== 'play' || table.playback || table.historyPending || reviewRunning(snapshot.review)) {
    return undefined;
  }
  return tableProgressFor(snapshot.phase, snapshot.phases).turn;
}

/**
 * Clears every chat once a new turn begins, while the viewer has turned it on.
 * The turn is remembered whether or not it is on, so turning it on never clears for turns already played.
 */
export function useAutoClearChatsAtNewTurn(client: TableSession, table: TableProjection) {
  const enabled = useAutoClearChats();
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const ready = conversations.online && conversations.summaries.length > 0;
  const turn = liveTurn(table);
  useEffect(() => {
    if (turn === undefined || !ready) {
      return;
    }
    const seen = readSeen(client.game);
    if (enabled && seen !== undefined && turn > seen) {
      client.conversations.clearAllChats();
    }
    if (seen === undefined || turn > seen) {
      writeSeen(client.game, turn);
    }
  }, [client, enabled, ready, turn]);
}
