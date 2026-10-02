/*
 * The tables a tab keeps for a reload (#1746) and the sign-in they belong to, read from browser storage alone.
 * Nothing here imports the Convex client, so the sign-out menu and the table runtime can use it without opening a connection.
 */
/** Every key a tab stores its last table under (#1746) starts with this. */
export const STORED_PLAY_TABLE_PREFIX = 'dunezone-play-table:';

/** Removes the tables this tab kept for a reload, so the next person on this browser never finds them. */
export function forgetStoredPlayTables() {
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
    return localStorage.getItem(
      `__convexAuthJWT_${(import.meta.env.VITE_CONVEX_URL ?? '').replace(/[^a-zA-Z0-9]/g, '')}`
    );
  } catch {
    return null;
  }
}

/** Whether this tab kept a table for `gameId` while someone is signed in; the table itself checks whose it is before showing it. */
export function hasStoredPlayTable(gameId: string): boolean {
  try {
    return storedAuthToken() !== null && sessionStorage.getItem(`${STORED_PLAY_TABLE_PREFIX}${gameId}`) !== null;
  } catch {
    return false;
  }
}

/** Removes the table this tab kept for `gameId`, once the directory says the viewer may no longer open it. */
export function forgetStoredPlayTable(gameId: string) {
  try {
    sessionStorage.removeItem(`${STORED_PLAY_TABLE_PREFIX}${gameId}`);
  } catch {
    /* Storage that cannot be read holds nothing to forget. */
  }
}

/** This browser's clock, which only ages a kept table out of storage and never reaches the table itself. */
export const storageNow = () => Date.now();
