import type { StoredTable, TableStore } from './storedTable';

type SavedTable = Pick<StoredTable, 'viewer' | 'snapshot'>;

/* How often a live table whose saved copy is otherwise unchanged stamps that copy as live again. */
const LIVE_RESTAMP_INTERVAL_MS = 5000;

/* The same requests in the same order: conversation sends keep their request objects while they wait. */
function sameRequests(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((request, index) => request === b[index]);
}

function stampedLiveSince(saved: { live: boolean; at: number }, now: number) {
  return saved.live && now - saved.at < LIVE_RESTAMP_INTERVAL_MS;
}

/* The same table and the same waiting messages as a save that already went out. */
function sameSave(saved: SavedTable & { pending: readonly unknown[] }, table: SavedTable, pending: readonly unknown[]) {
  return saved.viewer === table.viewer && saved.snapshot === table.snapshot && sameRequests(saved.pending, pending);
}

/**
 * The table a reload of this tab shows until a fresh view arrives (#1746): the server's own view of the last live table, with the messages still waiting to go out.
 */
export class TableKeeper {
  /* The server's own view of the last live table. */
  private kept: Omit<StoredTable, 'pending'> | null = null;
  /* What `keep` last handed the store, so an emit that changed nothing saved costs no write. */
  private lastSaved: (SavedTable & { pending: readonly unknown[]; live: boolean; at: number }) | null = null;

  constructor(
    private readonly game: string,
    private readonly store: TableStore | undefined,
    private readonly monotonicNow: () => number
  ) {}

  /* Whether this tab holds a table to show, live or kept. */
  holds() {
    return this.kept !== null;
  }

  /** The table this tab saved for a reload, now kept as the one to save again; null when it saved none. */
  restore(): StoredTable | null {
    const stored = this.store?.read(this.game);
    if (!stored) {
      return null;
    }
    this.kept = {
      viewer: stored.viewer,
      snapshot: stored.snapshot,
      serverNow: stored.serverNow,
      ...(stored.liveAt === undefined ? {} : { liveAt: stored.liveAt }),
    };
    return stored;
  }

  /* A refused table is saved no more, and what was saved is gone. */
  forget() {
    this.kept = null;
    this.lastSaved = null;
    this.store?.clear(this.game);
  }

  /*
   * Saves the table a reload of this tab shows: `live` while the room is live, otherwise the table kept before.
   * A carry, a hover or a pointer emits many times a second without changing what is saved,
   * so an unchanged table is only stamped as live again now and then, never written out on every move.
   */
  keep(live: SavedTable | null, pending: StoredTable['pending'], serverNow: () => number) {
    const now = this.monotonicNow();
    if (this.alreadySaved(live, pending, now)) {
      return;
    }
    if (live) {
      this.kept = { viewer: live.viewer, snapshot: live.snapshot, serverNow: serverNow() };
    }
    if (this.kept) {
      const { viewer, snapshot } = this.kept;
      this.lastSaved = { viewer, snapshot, pending, live: live !== null, at: now };
      this.store?.save(this.game, { ...this.kept, pending }, live !== null);
    }
  }

  /* Whether the store already holds what `keep` would save: the same table and messages, and, for a live table, stamped live recently. */
  private alreadySaved(live: SavedTable | null, pending: readonly unknown[], now: number) {
    const saved = this.lastSaved;
    if (!saved) {
      return false;
    }
    const table = live ?? this.kept;
    if (!table) {
      return false;
    }
    /* A table that went live or offline since is saved again, and a live one is stamped again once the interval passes. */
    const sameState = live ? stampedLiveSince(saved, now) : !saved.live;
    return sameState && sameSave(saved, table, pending);
  }
}
