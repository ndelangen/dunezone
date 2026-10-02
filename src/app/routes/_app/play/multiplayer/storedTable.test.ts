import { initialSnapshot } from '@shared/play/commands';
import type { Viewer } from '@shared/play/protocol';
import { expect, test } from 'vitest';

import { readStoredTable, STORED_TABLE_MAX_AGE_MS, storedTableText, tokenAccount } from './storedTable';
import type { StoredTable } from './storedTable';

const viewer: Viewer = { connectionId: 'c', userId: 'user', viewerSeat: 'seat-1', displayName: 'One', color: 'red' };
const table: StoredTable = { viewer, snapshot: initialSnapshot(), serverNow: 5, pending: [] };
const account = { userId: 'user', sessionId: 'session' };
const now = 1_000_000;

function storageWith(text: string | null) {
  const entries = new Map(text === null ? [] : [['dunezone-play-table:game', text]]);
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => void entries.delete(key),
  };
}

test('reads back what it stored for the same game, account and session', () => {
  const storage = storageWith(storedTableText('game', table, account, now));
  expect(readStoredTable(storage, 'game', account, now + 1)).toEqual({ ...table, liveAt: now });
});

test("refuses to store another account's table", () => {
  expect(storedTableText('game', table, { userId: 'other', sessionId: 'session' }, now)).toBeNull();
  expect(storedTableText('game', table, null, now)).toBeNull();
});

test.each([
  ['an older format', (text: string) => text.replace('"format":1', '"format":0')],
  ['a view that no longer parses', (text: string) => text.replace('"revision":0', '"revision":"zero"')],
  ['text that is not JSON', () => '{'],
  ['another game', (text: string) => text.replace('"gameId":"game"', '"gameId":"other"')],
])('drops %s instead of showing it', (_case, change) => {
  const storage = storageWith(change(storedTableText('game', table, account, now)!));
  expect(readStoredTable(storage, 'game', account, now)).toBeNull();
  expect(storage.entries.size).toBe(0);
});

test('drops a table older than a day, or one stamped in the future', () => {
  const text = storedTableText('game', table, account, now)!;
  expect(readStoredTable(storageWith(text), 'game', account, now + STORED_TABLE_MAX_AGE_MS + 1)).toBeNull();
  expect(readStoredTable(storageWith(text), 'game', account, now - 1)).toBeNull();
});

test('reads the account from a Convex Auth token subject', () => {
  const payload = btoa(JSON.stringify({ sub: 'user|session' })).replaceAll('=', '');
  expect(tokenAccount(`header.${payload}.signature`)).toEqual(account);
  expect(tokenAccount(null)).toBeNull();
  expect(tokenAccount('not-a-token')).toBeNull();
  expect(tokenAccount(`header.${btoa(JSON.stringify({ sub: 'user' }))}.signature`)).toBeNull();
});
