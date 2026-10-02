import { PLAY_REQUEST_TIMEOUT_MS, PLAY_TICKET_TTL_MS } from '@shared/play/admission';
import { initialSnapshot } from '@shared/play/commands';
import { KEEPALIVE_INTERVAL_MS, KEEPALIVE_PONG, TICKET_EXPIRED_CLOSE_CODE } from '@shared/play/protocol';
import { frameChange } from '@shared/play/updates';
import type { RoomView } from '@shared/play/updates';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { online, runtime, Socket } from './gameRuntime.test.fixture';
import { GameSubscription } from './GameSubscription';

const initial = (): RoomView => ({
  type: 'view',
  viewer: { connectionId: 'one', userId: 'user', viewerSeat: 'harkonnen', displayName: 'Player', color: '#fff' },
  epoch: 'epoch',
  sequence: 1,
  snapshot: initialSnapshot(),
  carries: [],
  pointers: [],
});
const stops: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
});
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  vi.useRealTimers();
});
async function subscribed(gameId = 'game') {
  const subscription = new GameSubscription(
    gameId,
    async () => ({ ok: true, ticket: 'a'.repeat(64), expiresInMs: 30_000 }),
    runtime
  );
  const listener = vi.fn();
  stops.push(subscription.subscribe(listener));
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  const view = initial();
  socket.deliver(view);
  return { subscription, listener, socket, view };
}

test('assembles patches before notifying the caller and asks once for a full view after a gap', async () => {
  const { subscription, socket, listener, view } = await subscribed();
  const next = { ...view, snapshot: { ...view.snapshot, revision: 1, phase: 2 } };
  socket.deliver({ type: 'update', epoch: view.epoch, baseSequence: 1, sequence: 2, ...frameChange(view, next) });
  expect(subscription.getSnapshot()?.snapshot).toMatchObject({ revision: 1, phase: 2 });
  expect(listener.mock.lastCall?.[0]).toMatchObject({ type: 'view', snapshot: { revision: 1, phase: 2 } });
  const gap = {
    type: 'update' as const,
    epoch: view.epoch,
    baseSequence: 4,
    sequence: 5,
    ...frameChange(next, next),
    completedCommandId: 'saved-drop',
  };
  socket.deliver(gap);
  socket.deliver(gap);
  expect(subscription.ready).toBe(false);
  expect(
    subscription.send({ type: 'command', commandId: 'blocked', expectedRevision: 1, action: { kind: 'turn', turn: 3 } })
  ).toBe(false);
  expect(socket.sent.filter((message) => message.type === 'sync')).toHaveLength(1);
  expect(listener.mock.lastCall?.[0]).toMatchObject({ type: 'resync', completedCommandId: 'saved-drop' });
  socket.deliver({ ...next, sequence: 6 });
  expect(subscription.ready).toBe(true);
});

test('two subscriptions keep independent views and retiring one cannot disconnect the other', async () => {
  const a = await subscribed('a');
  const b = await subscribed('b');
  a.socket.deliver({ ...a.view, snapshot: { ...a.view.snapshot, phase: 3, revision: 1 } });
  expect(b.subscription.getSnapshot()?.snapshot.phase).toBe(b.view.snapshot.phase);
  stops[0]();
  a.socket.deliver({ ...a.view, snapshot: { ...a.view.snapshot, phase: 8, revision: 2 } });
  expect(a.subscription.getSnapshot()).toBeNull();
  expect(b.subscription.ready).toBe(true);
  expect(b.socket.readyState).toBe(1);
});

test('a stale full snapshot cannot rewind presentation or corrupt the next patch baseline', async () => {
  const { subscription, socket, listener, view } = await subscribed();
  const visible = { ...view, sequence: 2, snapshot: { ...view.snapshot, revision: 5, phase: 4 } };
  socket.deliver(visible);
  const stale = { ...view, sequence: 3 };
  socket.deliver(stale);
  const intermediate = { ...stale, snapshot: { ...view.snapshot, revision: 1, phase: 2 } };
  socket.deliver({
    type: 'update',
    epoch: view.epoch,
    baseSequence: 3,
    sequence: 4,
    ...frameChange(stale, intermediate),
  });
  expect(subscription.getSnapshot()?.snapshot).toMatchObject({ revision: 5, phase: 4 });
  expect(listener.mock.lastCall?.[0]).toMatchObject({ type: 'view', snapshot: { revision: 5, phase: 4 } });
  const latest = { ...intermediate, snapshot: { ...view.snapshot, revision: 6, phase: 7 } };
  socket.deliver({
    type: 'update',
    epoch: view.epoch,
    baseSequence: 4,
    sequence: 5,
    ...frameChange(intermediate, latest),
  });
  expect(subscription.getSnapshot()?.snapshot).toMatchObject({ revision: 6, phase: 7 });
  expect(subscription.ready).toBe(true);
  expect(socket.sent.filter((message) => message.type === 'sync')).toHaveLength(0);
});

test('disconnect forgets the old baseline, rejects its late messages and accepts a fresh epoch', async () => {
  const { subscription, socket, view } = await subscribed();
  socket.deliver({ ...view, snapshot: { ...view.snapshot, revision: 10 } });
  socket.close(1006);
  expect(subscription.getSnapshot()).toBeNull();
  await vi.advanceTimersByTimeAsync(1000);
  const next = Socket.instances.at(-1)!;
  next.open();
  socket.deliver({ ...view, snapshot: { ...view.snapshot, revision: 11 } });
  expect(subscription.getSnapshot()).toBeNull();
  next.deliver({ ...view, epoch: 'new-epoch' });
  expect(subscription.getSnapshot()?.snapshot.revision).toBe(view.snapshot.revision);
  expect(subscription.ready).toBe(true);
});

test('applies a saved movement patch that the admission never asked for', async () => {
  const { subscription, socket, view } = await subscribed();
  expect(socket.sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64) }]);
  const next = structuredClone(view);
  next.snapshot.revision++;
  next.snapshot.table.pieces[0].position = [2, 0, 2];
  const update = {
    type: 'update' as const,
    epoch: view.epoch,
    baseSequence: 1,
    sequence: 2,
    ...frameChange(view, next),
  };
  expect(update.snapshot?.pieceMoves).toHaveLength(1);
  socket.deliver(update);
  expect(subscription.getSnapshot()?.snapshot).toEqual(next.snapshot);
  expect(socket.sent).toHaveLength(1);
});

test('a suspended admission reads as the connection opening until the table has shown once, and as a pause after', async () => {
  const subscription = new GameSubscription(
    'game',
    async () => ({ ok: true, ticket: 'a'.repeat(64), expiresInMs: 30_000 }),
    runtime
  );
  const listener = vi.fn();
  stops.push(subscription.subscribe(listener));
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  socket.deliver({ type: 'admission', status: 'suspended' });
  expect(subscription.status).toBe('suspended');
  expect(listener.mock.lastCall?.[0]).toEqual({ type: 'connection', error: null });
  socket.deliver(initial());
  expect(subscription.status).toBe('authorized');
  socket.deliver({ type: 'admission', status: 'suspended' });
  expect(listener.mock.lastCall?.[0]).toEqual({
    type: 'connection',
    error: 'Checking the connection. Table actions are paused.',
  });
});

test('an expired ticket reconnects with a new one, waiting longer each time until a view, and a denial stops', async () => {
  let issued = 0;
  const requestTicket = vi.fn(async () => ({
    ok: true as const,
    ticket: String(++issued).repeat(64),
    expiresInMs: 30_000,
  }));
  const subscription = new GameSubscription('game', requestTicket, runtime);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const opened = () => {
    const socket = Socket.instances.at(-1)!;
    socket.open();
    return socket;
  };
  const expire = async (socket: Socket, wait: number) => {
    socket.close(TICKET_EXPIRED_CLOSE_CODE);
    expect(subscription.status).toBe('suspended');
    const requested = requestTicket.mock.calls.length;
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(requestTicket).toHaveBeenCalledTimes(requested);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestTicket).toHaveBeenCalledTimes(requested + 1);
  };
  await expire(opened(), 1000);
  await expire(opened(), 2000);
  await expire(opened(), 4000);
  const admitted = opened();
  expect(admitted.sent).toEqual([{ type: 'admit', ticket: '4'.repeat(64) }]);
  admitted.deliver(initial());
  expect(subscription.status).toBe('authorized');
  await expire(admitted, 1000);
  const denied = opened();
  denied.deliver({ type: 'admission', status: 'denied' });
  denied.close(4401);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(subscription.status).toBe('denied');
  expect(requestTicket).toHaveBeenCalledTimes(5);
});

test('a ticket that lapses before or while the socket opens waits in the same backoff as one the Worker turned away', async () => {
  let now = 0;
  let requestTakes = 30_000;
  const requestTicket = vi.fn(async () => {
    now += requestTakes;
    return { ok: true as const, ticket: 'a'.repeat(64), expiresInMs: 30_000 };
  });
  const subscription = new GameSubscription('game', requestTicket, { ...runtime, monotonicNow: () => now });
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const reconnectsAfter = async (wait: number) => {
    expect(subscription.status).toBe('suspended');
    const requested = requestTicket.mock.calls.length;
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(requestTicket).toHaveBeenCalledTimes(requested);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestTicket).toHaveBeenCalledTimes(requested + 1);
  };
  expect(Socket.instances).toEqual([]);
  requestTakes = 0;
  await reconnectsAfter(1000);
  const lapsedWhileOpening = Socket.instances.at(-1)!;
  /* A browser fires the close event later, with the code of the close frame it receives back, which need not be the one it sent. */
  lapsedWhileOpening.close = () => {
    lapsedWhileOpening.readyState = 3;
    setTimeout(() => lapsedWhileOpening.onclose?.({ code: 1000 }));
  };
  now += 30_000;
  lapsedWhileOpening.open();
  expect(lapsedWhileOpening.sent).toEqual([]);
  expect(lapsedWhileOpening.readyState).toBe(3);
  await reconnectsAfter(2000);
  const turnedAway = Socket.instances.at(-1)!;
  turnedAway.open();
  turnedAway.close(TICKET_EXPIRED_CLOSE_CODE);
  await reconnectsAfter(4000);
});

test('a ticket answered after the request timeout is taken by the next attempt instead of asked for again (#1378)', async () => {
  let issued = 0;
  const answers: (() => void)[] = [];
  const requestTicket = vi.fn(
    () =>
      new Promise<{ ok: true; ticket: string; expiresInMs: number }>((resolve) => {
        const ticket = String(++issued).repeat(64);
        answers.push(() => resolve({ ok: true, ticket, expiresInMs: 30_000 }));
      })
  );
  const listener = vi.fn();
  const subscription = new GameSubscription('game', requestTicket, runtime);
  stops.push(subscription.subscribe(listener));
  await vi.advanceTimersByTimeAsync(PLAY_REQUEST_TIMEOUT_MS);
  expect(listener).toHaveBeenLastCalledWith({
    type: 'connection',
    error: 'The table could not be reached. Reconnecting...',
  });
  /* The answer lands while the subscription waits to try again, after it stopped waiting for it. */
  await vi.advanceTimersByTimeAsync(500);
  answers[0]();
  await vi.advanceTimersByTimeAsync(500);
  expect(requestTicket).toHaveBeenCalledTimes(1);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  expect(socket.sent).toEqual([{ type: 'admit', ticket: '1'.repeat(64) }]);
  socket.deliver(initial());
  expect(subscription.status).toBe('authorized');
});

test('a ticket request is asked again only once it failed or outlived a ticket lifetime', async () => {
  let now = 0;
  const pending: { reject: (error: Error) => void }[] = [];
  const requestTicket = vi.fn(
    () =>
      new Promise<never>((_, reject) => {
        pending.push({ reject });
      })
  );
  const subscription = new GameSubscription('game', requestTicket, { ...runtime, monotonicNow: () => now });
  stops.push(subscription.subscribe(vi.fn()));
  const retry = async () => {
    await vi.advanceTimersByTimeAsync(PLAY_REQUEST_TIMEOUT_MS + 1000);
    now += PLAY_REQUEST_TIMEOUT_MS + 1000;
  };
  await retry();
  await retry();
  expect(requestTicket).toHaveBeenCalledTimes(1);
  pending[0].reject(new Error('Connection lost.'));
  await retry();
  expect(requestTicket).toHaveBeenCalledTimes(2);
  now += PLAY_TICKET_TTL_MS;
  await retry();
  expect(requestTicket).toHaveBeenCalledTimes(3);
  expect(Socket.instances).toEqual([]);
});

test('an open socket sends a keepalive on an interval, ignores the answer and stops once it closes', async () => {
  const { subscription, socket } = await subscribed();
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS - 1);
  expect(socket.keepalives).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(socket.keepalives).toBe(1);
  socket.onmessage?.({ data: KEEPALIVE_PONG });
  expect(subscription.status).toBe('authorized');
  expect(subscription.ready).toBe(true);
  socket.close(1006);
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
  expect(socket.keepalives).toBe(1);
});

test('a socket that stops answering keepalives is dropped and reconnected, while answers keep it (#1662)', async () => {
  const { subscription, socket, listener } = await subscribed();
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 3);
  expect(socket.keepalives).toBe(3);
  expect(subscription.ready).toBe(true);
  socket.answersKeepalives = false;
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
  expect(socket.keepalives).toBe(4);
  expect(subscription.ready).toBe(true);
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
  expect(socket.readyState).toBe(3);
  expect(subscription.status).toBe('suspended');
  expect(listener.mock.lastCall?.[0]).toEqual({
    type: 'connection',
    error: 'The table could not be reached. Reconnecting...',
  });
  expect(Socket.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(Socket.instances).toHaveLength(2);
});

test('coming back online probes the open socket and skips the wait before a reconnect (#1662)', async () => {
  const { subscription, socket } = await subscribed();
  socket.answersKeepalives = false;
  for (const listener of online) {
    listener();
  }
  expect(socket.keepalives).toBe(1);
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
  expect(socket.readyState).toBe(3);
  expect(subscription.status).toBe('suspended');
  expect(Socket.instances).toHaveLength(1);
  for (const listener of online) {
    listener();
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(Socket.instances).toHaveLength(2);
});
