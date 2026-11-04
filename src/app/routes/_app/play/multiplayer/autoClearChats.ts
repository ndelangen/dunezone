import type { ConversationSummary } from '@shared/play/conversations';
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

/*
 * What this browser remembers per game: the turn it last saw, and the clears it still owes for that turn.
 * Kept in memory as well, so a browser without storage still clears for the turns this page sees.
 */
const memory = new Map<string, string>();
function recall(key: string) {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
function remember(key: string, value: string | null) {
  if (value === null) {
    memory.delete(key);
  } else {
    memory.set(key, value);
  }
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    /* Memory alone keeps it for this page. */
  }
}

const seenKey = (game: string) => `dunezone-chat-auto-clear-turn:${game}`;
function readSeen(game: string): number | undefined {
  const stored = Number(recall(seenKey(game)));
  return Number.isInteger(stored) && stored > 0 ? stored : undefined;
}

/* The clears asked for at the start of a turn, by conversation, until the room confirms each one; a dropped connection loses none. */
type Owed = Record<string, number>;
const owedKey = (game: string) => `dunezone-chat-auto-clear-owed:${game}`;
function readOwed(game: string): Owed {
  try {
    const parsed: unknown = JSON.parse(recall(owedKey(game)) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Owed) : {};
  } catch {
    return {};
  }
}
function writeOwed(game: string, owed: Owed) {
  remember(owedKey(game), Object.keys(owed).length > 0 ? JSON.stringify(owed) : null);
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
  remember(seenKey(game), String(turn));
  return seen !== undefined;
}

/* Asks again for each owed clear the room has not confirmed; confirmed ones, and chats this faction no longer has, are settled. */
function settleOwed(client: TableSession, summaries: ConversationSummary[]) {
  const owed = readOwed(client.game);
  const left: Owed = {};
  for (const [peerId, through] of Object.entries(owed)) {
    const summary = summaries.find((entry) => entry.peerId === peerId);
    if (summary && summary.cleared < through) {
      left[peerId] = through;
      /* A clear already on its way is not sent twice. */
      client.conversations.clearChat({ peerId, through });
    }
  }
  if (Object.keys(left).length !== Object.keys(owed).length) {
    writeOwed(client.game, left);
  }
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
  const summaries = ready ? conversations.summaries : undefined;
  useEffect(() => {
    if (turn === undefined) {
      return;
    }
    const started = enterTurn(client.game, turn);
    if (started && enabled) {
      writeOwed(client.game, { ...readOwed(client.game), ...client.conversations.clearAllChats() });
    }
  }, [client, enabled, turn]);
  useEffect(() => {
    if (summaries) {
      settleOwed(client, summaries);
    }
  }, [client, summaries]);
}
