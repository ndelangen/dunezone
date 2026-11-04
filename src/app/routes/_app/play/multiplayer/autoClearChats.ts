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
const memory = new Map<string, unknown>();
class Remembered {
  constructor(private readonly key: string) {}

  read(): unknown {
    try {
      const stored = localStorage.getItem(this.key);
      return stored === null ? memory.get(this.key) : JSON.parse(stored);
    } catch {
      return memory.get(this.key);
    }
  }

  /* Undefined forgets it. */
  write(value: unknown) {
    memory.set(this.key, value);
    try {
      if (value === undefined) {
        localStorage.removeItem(this.key);
      } else {
        localStorage.setItem(this.key, JSON.stringify(value));
      }
    } catch {
      /* Memory alone keeps it for this page. */
    }
  }
}

const seenTurn = (game: string) => new Remembered(`dunezone-chat-auto-clear-turn:${game}`);
/* The clears asked for at the start of a turn, by conversation, until the room confirms each one; a dropped connection loses none. */
const owedClears = (game: string) => new Remembered(`dunezone-chat-auto-clear-owed:${game}`);
type Owed = Record<string, number>;

function readSeen(seen: Remembered): number | undefined {
  const stored = Number(seen.read());
  return Number.isInteger(stored) && stored > 0 ? stored : undefined;
}
function readOwed(owed: Remembered): Owed {
  const stored = owed.read();
  return stored && typeof stored === 'object' ? (stored as Owed) : {};
}
function writeOwed(owed: Remembered, clears: Owed) {
  owed.write(Object.keys(clears).length > 0 ? clears : undefined);
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
function enterTurn(remembered: Remembered, turn: number) {
  const seen = readSeen(remembered);
  if (seen !== undefined && turn <= seen) {
    return false;
  }
  remembered.write(turn);
  return seen !== undefined;
}

/* Asks again for each owed clear the room has not confirmed; confirmed ones, and chats this faction no longer has, are settled. */
function settleOwed(client: TableSession, summaries: ConversationSummary[]) {
  const remembered = owedClears(client.game);
  const owed = readOwed(remembered);
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
    writeOwed(remembered, left);
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
    const started = enterTurn(seenTurn(client.game), turn);
    if (started && enabled) {
      const owed = owedClears(client.game);
      writeOwed(owed, { ...readOwed(owed), ...client.conversations.clearAllChats() });
    }
  }, [client, enabled, turn]);
  useEffect(() => {
    if (summaries) {
      settleOwed(client, summaries);
    }
  }, [client, summaries]);
}
