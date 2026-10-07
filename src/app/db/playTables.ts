/*
 * The tables a tab keeps for a reload (#1746) and the sign-in they belong to, read from browser storage alone.
 * Nothing here imports the Convex client, so the sign-out menu and the table runtime can use it without opening a connection.
 */
/** Every key a tab stores its last table under (#1746) starts with this. */
export const STORED_PLAY_TABLE_PREFIX = 'dunezone-play-table:';

/*
 * Tables this page was told to forget, which a write the table runtime still has queued must not bring back.
 * `null` stands for every table, as signing out forgets them all; a fresh live view of a game lets its table be kept again.
 */
const forgotten = new Set<string | null>();

/** Whether a queued write for `gameId` must be dropped, because the page forgot that table or every table since it was queued. */
export const forgetsPlayTable = (gameId: string) => forgotten.has(null) || forgotten.has(gameId);

/** The table for `gameId` is live again, so it may be kept. */
export function keepsPlayTable(gameId: string) {
  forgotten.delete(null);
  forgotten.delete(gameId);
}

/** Removes the tables this tab kept for a reload, so the next person on this browser never finds them. */
export function forgetStoredPlayTables() {
  forgotten.add(null);
  try {
    const keys = Object.keys(sessionStorage).filter((key) => key.startsWith(STORED_PLAY_TABLE_PREFIX));
    for (const key of keys) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* Storage that cannot be read holds nothing to forget. */
  }
}

/** Where Convex Auth keeps this deployment's token: its key name followed by the deployment address without punctuation. */
export const storedAuthTokenKey = () =>
  `__convexAuthJWT_${(import.meta.env.VITE_CONVEX_URL ?? '').replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * The auth token Convex Auth keeps for this deployment in localStorage, read without a network, or `null` once signed out.
 * Signing out erases it even when the server cannot be reached.
 */
export function storedAuthToken(): string | null {
  try {
    return localStorage.getItem(storedAuthTokenKey());
  } catch {
    return null;
  }
}

/** Removes the table this tab kept for `gameId`, once the directory says the viewer may no longer open it. */
export function forgetStoredPlayTable(gameId: string) {
  forgotten.add(gameId);
  try {
    sessionStorage.removeItem(`${STORED_PLAY_TABLE_PREFIX}${gameId}`);
  } catch {
    /* Storage that cannot be read holds nothing to forget. */
  }
}

/** This browser's clock, which only ages a kept table out of storage and never reaches the table itself. */
export const storageNow = () => Date.now();
