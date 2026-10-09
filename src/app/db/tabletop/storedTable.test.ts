import { initialSnapshot } from '@shared/play/commands';
import type { Viewer } from '@shared/play/protocol';
import { expect, test } from 'vitest';

import {
  readStoredTable,
  sessionTableStore,
  STORED_TABLE_MAX_AGE_MS,
  storedTableText,
  tokenAccount,
} from './storedTable';
import type { StoredTable } from './storedTable';

const viewer: Viewer = { connectionId: 'c', userId: 'user', viewerSeat: 'seat-1', displayName: 'One', color: 'red' };
const table: StoredTable = { viewer, snapshot: initialSnapshot(), serverNow: 5, pending: [] };
const account = { userId: 'user', sessionId: 'session' };
const now = 1_000_000;

function storageWith(text: string | null) {
  const entries = new Map(text === null ? [] : [['dunezone-play-table:game', text]]);
  return {
    entries,
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  };
}

test('reads back what it stored for the same game, account and session', () => {
  const storage = storageWith(storedTableText('game', table, account, now));
  expect(readStoredTable(storage, 'game', account, now + 1)).toEqual({ ...table, liveAt: now });
});

function aliasStore(text: string | null, who = account, at = now) {
  const storage = storageWith(text);
  const store = sessionTableStore({ storage: () => storage, account: () => who, now: () => at, onLeave: () => {} });
  return { storage, store };
}

test('an address hint uses the ID record and never creates or restamps a table', () => {
  const { storage, store } = aliasStore(storedTableText('game', table, account, now));
  expect(store.findGame('hidden-sietch')).toBeNull();
  store.rememberAddress('game', 'hidden-sietch');
  expect(store.findGame('hidden-sietch')).toBe('game');
  expect(store.findGame('game')).toBe('game');
  expect(store.read('game')).toEqual({ ...table, liveAt: now });
  expect([...storage.entries.keys()]).toEqual(['dunezone-play-table:game']);
  expect(JSON.parse(storage.getItem('dunezone-play-table:game')!)).toMatchObject({
    slug: 'hidden-sietch',
    savedAt: now,
  });
});

test.each([
  ['another account', { userId: 'other', sessionId: 'session' }, now, (text: string) => text],
  ['another sign-in', { userId: 'user', sessionId: 'other' }, now, (text: string) => text],
  ['an old table', account, now + STORED_TABLE_MAX_AGE_MS + 1, (text: string) => text],
  ['a future table', account, now - 1, (text: string) => text],
  ['an invalid view', account, now, (text: string) => text.replace('"revision":0', '"revision":"bad"')],
  ['a mismatched key', account, now, (text: string) => text.replace('"gameId":"game"', '"gameId":"other"')],
])('an alias rejects %s using the existing restoration guards', (_name, who, at, change) => {
  const { storage, store } = aliasStore(
    change(storedTableText('game', table, account, now, 'hidden-sietch')!),
    who,
    at
  );
  expect(store.findGame('hidden-sietch')).toBeNull();
  expect(storage.entries.size).toBe(0);
});

test('ambiguous hints restore neither table', () => {
  const { storage, store } = aliasStore(storedTableText('game', table, account, now, 'hidden-sietch'));
  storage.setItem('dunezone-play-table:other', storedTableText('other', table, account, now, 'hidden-sietch')!);
  expect(store.findGame('hidden-sietch')).toBeNull();
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
