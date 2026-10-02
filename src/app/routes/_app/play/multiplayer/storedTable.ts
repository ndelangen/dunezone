import { clientMessageSchema, serverMessageSchema } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, Viewer } from '@shared/play/protocol';
import { z } from 'zod';

import { STORED_PLAY_TABLE_PREFIX } from '@db/playTables';

type ConversationSend = Extract<ClientMessage, { type: 'conversation-send' }>;

/** The last table a tab held, kept so a reload can show it read-only until a fresh view replaces it (#1746). */
export type StoredTable = {
  viewer: Viewer;
  snapshot: GameSnapshot;
  /* The server's clock when the table was last live, so countdowns read as they stood rather than from now. */
  serverNow: number;
  /* Chat messages the room has not confirmed; the room saves each request id once, so sending one again after the reload is safe. */
  pending: ConversationSend[];
};

/** Who is signed in to this tab, as the auth token names them; `null` when nobody is. */
export type TableAccount = { userId: string; sessionId: string };

export type TableStore = {
  read(gameId: string): StoredTable | null;
  /* Keeps the newest table and writes it soon after, and at once when the page is hidden or unloads. */
  save(gameId: string, table: StoredTable): void;
  clear(gameId: string): void;
};

/* Bump when a stored table could still parse but would mean something else. */
const FORMAT = 1;
/* A backstop: a tab left open for a day shows the connecting frame on reload rather than a day-old table. */
export const STORED_TABLE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 2000;

const recordSchema = z.object({
  format: z.literal(FORMAT),
  gameId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  savedAt: z.number(),
  serverNow: z.number(),
  frame: z.unknown(),
  pending: z.array(z.unknown()),
});

const storageKey = (gameId: string) => `${STORED_PLAY_TABLE_PREFIX}${gameId}`;

/* The view frame the room sent, rebuilt around the stored parts, so the protocol's own schema decides whether it still parses. */
function parseTable(record: z.infer<typeof recordSchema>): StoredTable | null {
  const frame = serverMessageSchema.safeParse(record.frame);
  if (!frame.success || frame.data.type !== 'view') {
    return null;
  }
  const pending: ConversationSend[] = [];
  for (const entry of record.pending) {
    const request = clientMessageSchema.safeParse(entry);
    if (!request.success || request.data.type !== 'conversation-send') {
      return null;
    }
    pending.push(request.data);
  }
  return { viewer: frame.data.viewer, snapshot: frame.data.snapshot, serverNow: record.serverNow, pending };
}

/**
 * Reads the table stored for `gameId` in `storage`, or `null`.
 * A record that is not this account's and session's, is too old, or no longer parses is removed rather than shown.
 */
export function readStoredTable(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  gameId: string,
  account: TableAccount | null,
  now: number
): StoredTable | null {
  const key = storageKey(gameId);
  const text = storage.getItem(key);
  if (text === null) {
    return null;
  }
  const table = account && validRecord(text, gameId, account, now);
  if (!table) {
    storage.removeItem(key);
    return null;
  }
  return table;
}

function validRecord(text: string, gameId: string, account: TableAccount, now: number): StoredTable | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const record = recordSchema.safeParse(value);
  if (
    !record.success ||
    record.data.gameId !== gameId ||
    record.data.userId !== account.userId ||
    record.data.sessionId !== account.sessionId ||
    now - record.data.savedAt > STORED_TABLE_MAX_AGE_MS ||
    record.data.savedAt > now
  ) {
    return null;
  }
  const table = parseTable(record.data);
  return table?.viewer.userId === account.userId ? table : null;
}

/** The text stored for a table, or `null` when it is not the signed-in account's own. */
export function storedTableText(
  gameId: string,
  table: StoredTable,
  account: TableAccount | null,
  now: number
): string | null {
  if (!account || account.userId !== table.viewer.userId) {
    return null;
  }
  return JSON.stringify({
    format: FORMAT,
    gameId,
    userId: account.userId,
    sessionId: account.sessionId,
    savedAt: now,
    serverNow: table.serverNow,
    frame: { type: 'view', epoch: 'stored', viewer: table.viewer, snapshot: table.snapshot, carries: [], pointers: [] },
    pending: table.pending,
  });
}

/**
 * The account in a Convex Auth token: its subject is `userId|sessionId`.
 * The token is only read, never trusted: the room checks the real one on admission, and this only decides whose stored table a tab may show.
 */
export function tokenAccount(token: string | null): TableAccount | null {
  const payload = token?.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const { sub } = z
      .object({ sub: z.string() })
      .parse(JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))));
    const [userId, sessionId] = sub.split('|');
    return userId && sessionId ? { userId, sessionId } : null;
  } catch {
    return null;
  }
}

type BrowserStore = {
  storage: () => Storage | null;
  account: () => TableAccount | null;
  now: () => number;
  onLeave: (listener: () => void) => void;
};

/**
 * A store in the tab's `sessionStorage`: it survives a reload of this tab only, and is gone when the tab closes.
 * Nothing reaches another tab, and another account signed in to this one never matches a record.
 */
export function sessionTableStore({ storage, account, now, onLeave }: BrowserStore): TableStore {
  const queued = new Map<string, StoredTable>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const target = storage();
    for (const [gameId, table] of queued) {
      const text = storedTableText(gameId, table, account(), now());
      try {
        if (text === null) {
          target?.removeItem(storageKey(gameId));
        } else {
          target?.setItem(storageKey(gameId), text);
        }
      } catch {
        /* A full or blocked storage only costs the next reload its table. */
      }
    }
    queued.clear();
  };
  onLeave(flush);
  return {
    read(gameId) {
      const target = storage();
      try {
        return target ? readStoredTable(target, gameId, account(), now()) : null;
      } catch {
        return null;
      }
    },
    save(gameId, table) {
      queued.set(gameId, table);
      timer ??= setTimeout(flush, WRITE_DELAY_MS);
    },
    clear(gameId) {
      queued.delete(gameId);
      try {
        storage()?.removeItem(storageKey(gameId));
      } catch {
        /* Nothing was readable either. */
      }
    },
  };
}
