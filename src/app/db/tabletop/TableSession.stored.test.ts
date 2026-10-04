import { initialSnapshot } from '@shared/play/commands';
import type { GameSnapshot, Viewer } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { forgetStoredPlayTable, keepsPlayTable } from '@db/playTables';
import { GameSubscription } from '@app/routes/_app/play/multiplayer/GameSubscription';

import { runtime, Socket } from '../../routes/_app/play/multiplayer/gameRuntime.test.fixture';
import { sessionTableStore, STORED_TABLE_MAX_AGE_MS } from './storedTable';
import type { TableAccount } from './storedTable';
import { TableSession } from './TableSession';

/* A reload is a new session over the same tab storage; the store writes two seconds after a change, or as the page leaves. */
const storage = new Map<string, string>();
const tabStorage = {
  get length() {
    return storage.size;
  },
  key: (index: number) => [...storage.keys()][index] ?? null,
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
} satisfies Storage;
let account: TableAccount | null;
let leave: () => void;
let stops: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  storage.clear();
  keepsPlayTable('game');
  account = { userId: 'user', sessionId: 'session-one' };
});
afterEach(() => {
  for (const stop of stops) {
    stop();
  }
  stops = [];
  vi.useRealTimers();
});

const viewer: Viewer = {
  connectionId: 'connection',
  userId: 'user',
  viewerSeat: 'seat-1',
  displayName: 'One',
  color: 'red',
};
const snapshot: GameSnapshot = {
  ...initialSnapshot(),
  stage: 'setup',
  roster: {
    seatCount: 2,
    seats: [
      { id: 'seat-1', position: 0, faction: { id: 'one', name: 'One', color: 'red' } },
      { id: 'seat-2', position: 1, faction: { id: 'two', name: 'Two', color: 'blue' } },
    ],
  },
  hand: [],
  bank: { factionId: 'one', balance: 7 },
};
const socket = () => Socket.instances.at(-1)!;

/* Each load of the page builds its runtime afresh, as a reload does. */
function load() {
  const tables = sessionTableStore({
    storage: () => tabStorage,
    account: () => account,
    now: () => Date.now(),
    onLeave: (listener) => {
      leave = listener;
    },
  });
  const client = new TableSession(
    'game',
    new GameSubscription('game', async () => ({ ok: true, ticket: 'a'.repeat(64), expiresInMs: 30_000 }), {
      ...runtime,
      tables,
    }),
    {
      ...runtime,
      tables,
    }
  );
  stops.push(client.connect());
  return client;
}

async function live(frame: Partial<{ snapshot: GameSnapshot; viewer: Viewer }> = {}) {
  await vi.advanceTimersByTimeAsync(0);
  socket().open();
  socket().deliver({ type: 'view', viewer, epoch: 'epoch', snapshot, carries: [], pointers: [], ...frame });
}

async function visitAndLeave() {
  const client = load();
  await live();
  socket().close();
  leave();
  return client;
}

test('a reload shows the last table locked, with the hand, before anything connects', async () => {
  await visitAndLeave();
  const reloaded = load();

  expect(reloaded.getSnapshot().table).toMatchObject({
    reconnecting: true,
    canInteract: false,
    snapshot: { bank: { balance: 7 } },
  });
  await vi.advanceTimersByTimeAsync(0);
  socket().open();
  expect(socket().sent.filter((message) => message.type === 'command')).toEqual([]);
});

test('the first live view replaces the kept table and unlocks it', async () => {
  await visitAndLeave();
  const reloaded = load();
  await live({ snapshot: { ...snapshot, bank: { factionId: 'one', balance: 9 } } });

  expect(reloaded.getSnapshot().table).toMatchObject({ reconnecting: false, snapshot: { bank: { balance: 9 } } });
});

test('another account or a new sign-in on this tab never sees the kept table, and the record is dropped', async () => {
  await visitAndLeave();
  account = { userId: 'someone-else', sessionId: 'session-two' };
  expect(load().getSnapshot().table).toBeNull();
  expect(storage.size).toBe(0);

  await visitAndLeave();
  account = { userId: 'user', sessionId: 'session-two' };
  expect(load().getSnapshot().table).toBeNull();

  await visitAndLeave();
  account = null;
  expect(load().getSnapshot().table).toBeNull();
});

test('a refusal clears the kept table', async () => {
  await visitAndLeave();
  const reloaded = load();
  await vi.advanceTimersByTimeAsync(0);
  socket().open();
  socket().deliver({ type: 'admission', status: 'denied' });

  expect(reloaded.getSnapshot().table).toBeNull();
  expect(storage.size).toBe(0);
  expect(load().getSnapshot().table).toBeNull();
});

test('a chat message written offline survives the reload and is sent once the table is live', async () => {
  const client = await visitAndLeave();
  client.conversations.submit({ peerId: 'two', text: 'A plan' });
  leave();

  const reloaded = load();
  expect(reloaded.getSnapshot().conversations.pending).toMatchObject([
    { request: { text: 'A plan' }, delivery: { state: 'unsent' } },
  ]);
  const [original] = client.conversations.unconfirmed();
  await live();
  expect(socket().sent.filter((message) => message.type === 'conversation-send')).toEqual([original]);
});

test('the kept table is written soon after a change without waiting for the page to leave', async () => {
  load();
  await live();
  expect(storage.size).toBe(0);
  await vi.advanceTimersByTimeAsync(2000);
  expect(storage.size).toBe(1);
});

test('a message the room rejected is not carried into the reload', async () => {
  const client = load();
  await live();
  client.conversations.submit({ peerId: 'two', text: 'A plan' });
  const [request] = socket().sent.filter((message) => message.type === 'conversation-send');
  socket().deliver({ type: 'rejected', requestId: request!.requestId, message: 'Conversations are closed.' });
  leave();

  expect(load().getSnapshot().conversations.pending).toEqual([]);
});

test('a table the directory refused stays forgotten, even with a write still queued', async () => {
  const client = await visitAndLeave();
  client.conversations.submit({ peerId: 'two', text: 'Queued' });
  forgetStoredPlayTable('game');
  await vi.advanceTimersByTimeAsync(2000);
  leave();

  expect(storage.size).toBe(0);
  expect(load().getSnapshot().table).toBeNull();
});

test('a table kept while offline ages from when it was last live, not from its last write', async () => {
  await visitAndLeave();
  vi.setSystemTime(Date.now() + STORED_TABLE_MAX_AGE_MS - 1000);
  const reloaded = load();
  await vi.advanceTimersByTimeAsync(0);
  socket().close();
  leave();
  vi.setSystemTime(Date.now() + 2000);

  expect(load().getSnapshot().table).toBeNull();
  expect(reloaded.getSnapshot().table).not.toBeNull();
});
