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

/* Looking back at a checkpoint or a recall is not the live table, so its turn never clears anything. */
function lookingBack(table: TableProjection) {
  return Boolean(table.playback || table.historyPending || reviewRunning(table.snapshot.review));
}

/** The live table's turn, or undefined outside play and while looking back at history or a recall. */
function liveTurn(table: TableProjection): number | undefined {
  const { snapshot } = table;
  if (snapshot.stage !== 'play' || lookingBack(table)) {
    return undefined;
  }
  return tableProgressFor(snapshot.phase, snapshot.phases).turn;
}

/* Moves the remembered turn on to `turn`; true when that starts a turn after one this browser saw. */
function enterTurn(game: string, turn: number) {
  const seen = readSeen(game);
  if (seen !== undefined && turn <= seen) {
    return false;
  }
  writeSeen(game, turn);
  return seen !== undefined;
}

/**
 * Clears every chat once a new turn begins, while the viewer has turned it on.
 * The turn is remembered whether or not it is on, so turning it on never clears for turns already played.
 */
export function useAutoClearChatsAtNewTurn(client: TableSession, table: TableProjection) {
  const enabled = useAutoClearChats();
  const { conversations } = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const ready = conversations.online && conversations.summaries.length > 0;
  const turn = ready ? liveTurn(table) : undefined;
  useEffect(() => {
    if (turn !== undefined && enterTurn(client.game, turn) && enabled) {
      client.conversations.clearAllChats();
    }
  }, [client, enabled, turn]);
}
