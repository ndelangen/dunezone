import { clientMessageSchema, serverMessageSchema } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, Viewer } from '@shared/play/protocol';
import { z } from 'zod';

import { forgetsPlayTable, keepsPlayTable, STORED_PLAY_TABLE_PREFIX } from '@db/playTables';

type ConversationSend = Extract<ClientMessage, { type: 'conversation-send' }>;

/** The last table a tab held, kept so a reload can show it read-only until a fresh view replaces it (#1746). */
export type StoredTable = {
  viewer: Viewer;
  snapshot: GameSnapshot;
  /* The server's clock when the table was last live, so countdowns read as they stood rather than from now. */
  serverNow: number;
  /* Chat messages the room has not confirmed; the room saves each request id once, so sending one again after the reload is safe. */
  pending: ConversationSend[];
  /* When the table was last live, by this browser's clock; the store stamps it, and the day-old backstop counts from it. */
  liveAt?: number;
};

/** Who is signed in to this tab, as the auth token names them; `null` when nobody is. */
export type TableAccount = { userId: string; sessionId: string };

export type TableStore = {
  read(gameId: string): StoredTable | null;
  /** Finds an existing ID record by its known address, using the same restoration guards as read. */
  findGame(address: string): string | null;
  /** Keeps authorized address metadata on the ID record, without extending its age or creating a snapshot. */
  rememberAddress(gameId: string, slug: string): void;
  /*
   * Keeps the newest table and writes it soon after, and at once when the page is hidden or unloads.
   * `live` says the table came from a live view, which stamps it; a table kept from an earlier visit keeps its stamp.
   */
  save(gameId: string, table: StoredTable, live: boolean): void;
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
  slug: z.string().optional(),
  userId: z.string(),
  sessionId: z.string(),
  savedAt: z.number(),
  serverNow: z.number(),
  frame: z.unknown(),
  pending: z.array(z.unknown()),
});

type StoredRecord = z.infer<typeof recordSchema>;

const storageKey = (gameId: string) => `${STORED_PLAY_TABLE_PREFIX}${gameId}`;

/* The view frame the room sent, rebuilt around the stored parts, so the protocol's own schema decides whether it still parses. */
function parseTable(record: StoredRecord): StoredTable | null {
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
  return {
    viewer: frame.data.viewer,
    snapshot: frame.data.snapshot,
    serverNow: record.serverNow,
    pending,
    liveAt: record.savedAt,
  };
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

function parseRecord(text: string): StoredRecord | null {
  try {
    return recordSchema.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}

/* The record names this game, this account and this sign-in, and was written within the last day. */
function belongs(record: StoredRecord, gameId: string, account: TableAccount, now: number) {
  const age = now - record.savedAt;
  const owner = record.userId === account.userId && record.sessionId === account.sessionId;
  return record.gameId === gameId && owner && age >= 0 && age <= STORED_TABLE_MAX_AGE_MS;
}

function validRecord(text: string, gameId: string, account: TableAccount, now: number): StoredTable | null {
  const record = parseRecord(text);
  const table = record && belongs(record, gameId, account, now) ? parseTable(record) : null;
  return table?.viewer.userId === account.userId ? table : null;
}

/** The text stored for a table, or `null` when it is not the signed-in account's own. */
export function storedTableText(
  gameId: string,
  table: StoredTable,
  account: TableAccount | null,
  now: number,
  slug?: string
): string | null {
  if (!account || account.userId !== table.viewer.userId) {
    return null;
  }
  return JSON.stringify({
    format: FORMAT,
    gameId,
    ...(slug === undefined ? {} : { slug }),
    userId: account.userId,
    sessionId: account.sessionId,
    savedAt: table.liveAt ?? now,
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
  const addresses = new Map<string, string>();
  /* When each game's table was last live, so a table kept while offline is not re-stamped by every write. */
  const liveAt = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const target = storage();
    for (const [gameId, table] of queued) {
      const text = forgetsPlayTable(gameId)
        ? null
        : storedTableText(gameId, table, account(), now(), addresses.get(gameId));
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
        const table = target ? readStoredTable(target, gameId, account(), now()) : null;
        const record = table && target ? parseRecord(target.getItem(storageKey(gameId))!) : null;
        if (record?.slug) {
          addresses.set(gameId, record.slug);
        }
        return table;
      } catch {
        return null;
      }
    },
    findGame(address) {
      const target = storage();
      if (!target) {
        return null;
      }
      try {
        if (!forgetsPlayTable(address) && readStoredTable(target, address, account(), now())) {
          return address;
        }
        const keys = Array.from({ length: target.length }, (_, index) => target.key(index));
        let found: string | null = null;
        for (const key of keys) {
          if (!key?.startsWith(STORED_PLAY_TABLE_PREFIX)) {
            continue;
          }
          const text = target.getItem(key);
          const record = text === null ? null : parseRecord(text);
          if (record?.slug !== address) {
            continue;
          }
          const gameId = key.slice(STORED_PLAY_TABLE_PREFIX.length);
          if (!forgetsPlayTable(gameId) && readStoredTable(target, gameId, account(), now())) {
            /* Ambiguous hints cannot choose which private table to restore. */
            if (found !== null && found !== gameId) {
              return null;
            }
            found = gameId;
          }
        }
        return found;
      } catch {
        return null;
      }
    },
    rememberAddress(gameId, slug) {
      addresses.set(gameId, slug);
      const target = storage();
      try {
        const table = target ? readStoredTable(target, gameId, account(), now()) : null;
        if (table && !forgetsPlayTable(gameId)) {
          const text = storedTableText(gameId, table, account(), now(), slug);
          if (text !== null) {
            target?.setItem(storageKey(gameId), text);
          }
        }
      } catch {
        /* A blocked storage only costs the next reload its address hint. */
      }
    },
    save(gameId, table, live) {
      if (live) {
        keepsPlayTable(gameId);
      }
      if (live) {
        liveAt.set(gameId, now());
      }
      const stamp = liveAt.get(gameId) ?? table.liveAt;
      queued.set(gameId, stamp === undefined ? table : { ...table, liveAt: stamp });
      timer ??= setTimeout(flush, WRITE_DELAY_MS);
    },
    clear(gameId) {
      queued.delete(gameId);
      addresses.delete(gameId);
      try {
        storage()?.removeItem(storageKey(gameId));
      } catch {
        /* Nothing was readable either. */
      }
    },
  };
}
