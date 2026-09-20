import { initialSnapshot } from '@shared/play/commands';
import type { GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { hidden, runtime, Socket } from './gameRuntime.test.fixture';
import { TableSession } from './TableSession';

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
});
afterEach(() => {
  stop?.();
  hidden.clear();
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
};
const socket = () => Socket.instances.at(-1)!;
function authorize(identity = viewer, supported = true) {
  socket().deliver({
    type: 'view',
    ...(supported ? { conversations: true } : {}),
    viewer: identity,
    epoch: 'epoch',
    snapshot,
    carries: [],
    pointers: [],
  });
}
async function connect() {
  const client = new TableSession(
    'game',
    async () => ({ ok: true, ticket: 'a'.repeat(64), expiresAt: Date.now() + 30_000 }),
    runtime
  );
  stop = client.connect();
  await vi.advanceTimersByTimeAsync(0);
  socket().open();
  authorize();
  return client;
}
function sent() {
  return socket().sent.filter((entry) => entry.type === 'conversation-send');
}
const saved = (requestId: string) => ({
  sequence: 1,
  requestId,
  senderFactionId: 'one',
  author: 'One',
  text: 'A plan',
  savedAt: Date.now(),
});

test('queues offline, retries a lost acknowledgment with the same ID, and calls a message sent only after saving', async () => {
  const client = await connect();
  client.conversations.submit({ peerId: 'two', text: 'A plan' });
  const first = sent()[0]!;
  expect(client.getSnapshot().conversations.pending[0]?.status).toBe('Pending');
  socket().close();
  client.conversations.submit({ peerId: 'two', text: 'Another plan' });
  expect(client.getSnapshot().conversations.pending).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1000);
  socket().open();
  expect(sent()).toHaveLength(0);
  authorize();
  expect(sent()[0]).toEqual(first);
  expect(sent()).toHaveLength(2);
  socket().deliver({ type: 'conversation-message', factionId: 'one', peerId: 'two', message: saved(first.requestId) });
  expect(client.getSnapshot().conversations.pending).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(15_000);
  const failed = client.getSnapshot().conversations.pending[0]!;
  expect(failed.status).toBe('Failed');
  client.conversations.retry(failed.request.requestId);
  expect(sent().at(-1)).toEqual(failed.request);
});

test.each(['neutral', 'seat-2'])(
  'discards old private history and queued sends when reconnect assigns %s',
  async (viewerSeat) => {
    const client = await connect();
    client.conversations.load({ peerId: 'two' });
    const request = socket().sent.find((entry) => entry.type === 'conversation-history')!;
    socket().deliver({
      ...request,
      type: 'conversation-history',
      factionId: 'one',
      peerId: 'two',
      before: Number.MAX_SAFE_INTEGER,
      entries: [saved('saved')],
      more: false,
    } as ServerMessage);
    expect(client.getSnapshot().conversations.pages.two?.entries).toHaveLength(1);
    socket().close();
    client.conversations.submit({ peerId: 'two', text: 'Never send under a different faction' });
    expect(client.getSnapshot().conversations.pages).toEqual({});
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    authorize({ ...viewer, viewerSeat });
    expect(sent()).toHaveLength(0);
    expect(client.getSnapshot().conversations.pending).toEqual([]);
    expect(client.getSnapshot().conversations.pages).toEqual({});
  }
);

test('clears private history immediately on a live seat change and an identity scrub', async () => {
  const client = await connect();
  socket().deliver({
    type: 'conversations',
    factionId: 'one',
    generation: 0,
    entries: [{ peerId: 'two', latest: 1, unread: 1 }],
  });
  client.conversations.load({ peerId: 'two' });
  const request = socket().sent.find((entry) => entry.type === 'conversation-history')!;
  socket().deliver({
    ...request,
    type: 'conversation-history',
    factionId: 'one',
    peerId: 'two',
    before: Number.MAX_SAFE_INTEGER,
    entries: [saved('saved')],
    more: false,
  } as ServerMessage);
  expect(client.getSnapshot().conversations.pages.two?.entries).toHaveLength(1);
  expect(socket().sent.some((entry) => entry.type === 'conversation-read')).toBe(false);
  socket().deliver({
    type: 'conversations',
    factionId: 'one',
    generation: 1,
    entries: [{ peerId: 'two', latest: 1, unread: 1 }],
  });
  expect(client.getSnapshot().conversations.pages).toEqual({});
  client.conversations.submit({ peerId: 'two', text: 'A plan' });
  authorize({ ...viewer, viewerSeat: 'neutral' });
  expect(client.getSnapshot().conversations.context).toBeNull();
  expect(client.getSnapshot().conversations.pending).toEqual([]);
});

test('negotiates support without sending new messages to an older Worker', async () => {
  const client = await connect();
  expect(socket().sent).toContainEqual({ type: 'sync', conversations: true });
  authorize(viewer, false);
  expect(client.getSnapshot().conversations.context).toBeNull();
  expect(client.conversations.submit({ peerId: 'two', text: 'A plan' })).toBe(false);
});

test('offers history retry after a response is lost and ignores the late page', async () => {
  const client = await connect();
  client.conversations.load({ peerId: 'two' });
  const request = socket().sent.find((entry) => entry.type === 'conversation-history')!;
  await vi.advanceTimersByTimeAsync(15_000);
  expect(client.getSnapshot().conversations.pages.two?.error).toBe('History could not load. Try again.');
  client.conversations.load({ peerId: 'two' });
  socket().deliver({
    ...request,
    type: 'conversation-history',
    factionId: 'one',
    peerId: 'two',
    before: Number.MAX_SAFE_INTEGER,
    entries: [saved('late')],
    more: false,
  } as ServerMessage);
  expect(client.getSnapshot().conversations.pages.two?.entries).toEqual([]);
});
