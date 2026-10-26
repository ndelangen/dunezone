import { PLAY_ADMISSION_RETRY_MAX_MS, PLAY_PENDING_TIMEOUT_MS, PLAY_REQUEST_TIMEOUT_MS } from '@shared/play/admission';
import { initialSnapshot } from '@shared/play/commands';
import { KEEPALIVE_INTERVAL_MS, KEEPALIVE_PONG, PASS_EXPIRED_CLOSE_CODE } from '@shared/play/protocol';
import { testSeatPass as seatPass } from '@shared/play/seatPass.test.fixture';
import { frameChange } from '@shared/play/updates';
import type { RoomView } from '@shared/play/updates';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { online, runtime, Socket, visible } from './gameRuntime.test.fixture';
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
  const subscription = new GameSubscription(gameId, async () => ({ ok: true, pass: 'pass.a' }), runtime);
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
    subscription.send({ type: 'command', commandId: 'blocked', expectedRevision: 1, action: { kind: 'phase' } })
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
  expect(socket.sent).toEqual([{ type: 'admit', pass: 'pass.a' }]);
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
  const subscription = new GameSubscription('game', async () => ({ ok: true, pass: 'pass.a' }), runtime);
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

test('an expired pass reconnects with a new one, waiting longer each time until a view, and a denial stops', async () => {
  let issued = 0;
  const requestAdmission = vi.fn(async () => ({
    ok: true as const,
    pass: `pass.${++issued}`,
  }));
  const subscription = new GameSubscription('game', requestAdmission, runtime);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const opened = () => {
    const socket = Socket.instances.at(-1)!;
    socket.open();
    return socket;
  };
  const expire = async (socket: Socket, wait: number) => {
    socket.close(PASS_EXPIRED_CLOSE_CODE);
    expect(subscription.status).toBe('suspended');
    const requested = requestAdmission.mock.calls.length;
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(requestAdmission).toHaveBeenCalledTimes(requested);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestAdmission).toHaveBeenCalledTimes(requested + 1);
  };
  await expire(opened(), 1000);
  await expire(opened(), 2000);
  await expire(opened(), 4000);
  const admitted = opened();
  expect(admitted.sent).toEqual([{ type: 'admit', pass: 'pass.4' }]);
  admitted.deliver(initial());
  expect(subscription.status).toBe('authorized');
  await expire(admitted, 1000);
  const denied = opened();
  denied.deliver({ type: 'admission', status: 'denied' });
  denied.close(4401);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(subscription.status).toBe('denied');
  expect(requestAdmission).toHaveBeenCalledTimes(5);
});

test('the expired-pass backoff stops growing at its cap, and a view resets it', async () => {
  let issued = 0;
  const requestAdmission = vi.fn(async () => ({
    ok: true as const,
    pass: `pass.${++issued}`,
  }));
  const subscription = new GameSubscription('game', requestAdmission, runtime);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const opened = () => {
    const socket = Socket.instances.at(-1)!;
    socket.open();
    return socket;
  };
  const expire = async (socket: Socket, wait: number) => {
    socket.close(PASS_EXPIRED_CLOSE_CODE);
    expect(subscription.status).toBe('suspended');
    const requested = requestAdmission.mock.calls.length;
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(requestAdmission).toHaveBeenCalledTimes(requested);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestAdmission).toHaveBeenCalledTimes(requested + 1);
  };
  for (const wait of [1000, 2000, 4000, 8000, 16_000, PLAY_ADMISSION_RETRY_MAX_MS, PLAY_ADMISSION_RETRY_MAX_MS]) {
    await expire(opened(), wait);
  }
  const admitted = opened();
  admitted.deliver(initial());
  expect(subscription.status).toBe('authorized');
  await expire(admitted, 1000);
});

test('an admission answered after the request timeout is taken by the next attempt instead of asked for again (#1378)', async () => {
  let issued = 0;
  const answers: (() => void)[] = [];
  const requestAdmission = vi.fn(
    () =>
      new Promise<{ ok: true; pass: string }>((resolve) => {
        const pass = `pass.${++issued}`;
        answers.push(() => resolve({ ok: true, pass }));
      })
  );
  const listener = vi.fn();
  const subscription = new GameSubscription('game', requestAdmission, runtime);
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
  expect(requestAdmission).toHaveBeenCalledTimes(1);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  expect(socket.sent).toEqual([{ type: 'admit', pass: 'pass.1' }]);
  socket.deliver(initial());
  expect(subscription.status).toBe('authorized');
});

test('an admission request is asked again only once it failed or hung for 30 s', async () => {
  let now = 0;
  const pending: { reject: (error: Error) => void }[] = [];
  const requestAdmission = vi.fn(
    () =>
      new Promise<never>((_, reject) => {
        pending.push({ reject });
      })
  );
  const subscription = new GameSubscription('game', requestAdmission, { ...runtime, monotonicNow: () => now });
  stops.push(subscription.subscribe(vi.fn()));
  const retry = async () => {
    await vi.advanceTimersByTimeAsync(PLAY_REQUEST_TIMEOUT_MS + 1000);
    now += PLAY_REQUEST_TIMEOUT_MS + 1000;
  };
  await retry();
  await retry();
  expect(requestAdmission).toHaveBeenCalledTimes(1);
  pending[0].reject(new Error('Connection lost.'));
  await retry();
  expect(requestAdmission).toHaveBeenCalledTimes(2);
  now += 30_000;
  await retry();
  expect(requestAdmission).toHaveBeenCalledTimes(3);
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
  /* The table had shown, so the reconnect reads as the connection opening. */
  expect(listener.mock.lastCall?.[0]).toEqual({ type: 'connection', error: null });
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

test('a probe on coming back online gets a whole interval to be answered, and a wait the Worker asked for is kept (#1662)', async () => {
  const { subscription, socket } = await subscribed();
  socket.answersKeepalives = false;
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS - 1);
  for (const listener of online) {
    listener();
  }
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS - 1);
  expect(socket.readyState).toBe(1);
  socket.onmessage?.({ data: KEEPALIVE_PONG });
  await vi.advanceTimersByTimeAsync(1);
  expect(subscription.ready).toBe(true);
  socket.close(4413);
  for (const listener of online) {
    listener();
  }
  await vi.advanceTimersByTimeAsync(4999);
  expect(Socket.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(Socket.instances).toHaveLength(2);
});

test('a tab coming back to the foreground probes the open socket and drops it after one silent interval', async () => {
  const { subscription, socket } = await subscribed();
  socket.answersKeepalives = false;
  for (const listener of visible) {
    listener();
  }
  expect(socket.keepalives).toBe(1);
  await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
  expect(socket.readyState).toBe(3);
  expect(subscription.status).toBe('suspended');
});

test('a pause right after a resync request stays a pause and keeps the socket', async () => {
  const { subscription, socket, view } = await subscribed();
  socket.deliver({ type: 'update', epoch: view.epoch, baseSequence: 4, sequence: 5, ...frameChange(view, view) });
  expect(socket.sent.filter((message) => message.type === 'sync')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1000);
  socket.deliver({ type: 'admission', status: 'suspended' });
  await vi.advanceTimersByTimeAsync(PLAY_PENDING_TIMEOUT_MS);
  expect(socket.readyState).toBe(1);
  expect(Socket.instances).toHaveLength(1);
  expect(subscription.status).toBe('suspended');
  socket.deliver({ ...view, sequence: 6 });
  expect(subscription.ready).toBe(true);
});

test('a table that never answers keeps saying so through every retry until a view arrives', async () => {
  const subscription = new GameSubscription('game', async () => ({ ok: true, pass: 'pass.a' }), runtime);
  const listener = vi.fn();
  stops.push(subscription.subscribe(listener));
  await vi.advanceTimersByTimeAsync(0);
  const unreachable = { type: 'connection', error: 'The table could not be reached. Reconnecting...' };
  /* A Worker that refuses the upgrade or answers 500 closes the socket abnormally before it ever opens. */
  Socket.instances.at(-1)!.close(1006);
  expect(listener.mock.lastCall?.[0]).toEqual(unreachable);
  await vi.advanceTimersByTimeAsync(1000);
  expect(subscription.status).toBe('connecting');
  expect(listener.mock.lastCall?.[0]).toEqual(unreachable);
  /* A Worker that answers but finds the pass ran out was reached, so the retry after it reads as connecting. */
  const lapsed = Socket.instances.at(-1)!;
  lapsed.open();
  lapsed.close(PASS_EXPIRED_CLOSE_CODE);
  await vi.advanceTimersByTimeAsync(1000);
  expect(listener.mock.lastCall?.[0]).toEqual({ type: 'connection', error: null });
  const socket = Socket.instances.at(-1)!;
  socket.open();
  socket.deliver(initial());
  expect(subscription.status).toBe('authorized');
  /* Once the table has shown, a dropped socket reconnects as the connection opening again. */
  socket.close(1006);
  await vi.advanceTimersByTimeAsync(1000);
  expect(listener.mock.lastCall?.[0]).toEqual({ type: 'connection', error: null });
});

test('an admission service that fails or turns the game away keeps its reason through the retry', async () => {
  const requestAdmission = vi
    .fn()
    .mockRejectedValueOnce(new Error('Convex is down.'))
    .mockResolvedValue({ ok: false, reason: 'unavailable' });
  const subscription = new GameSubscription('game', requestAdmission, runtime);
  const listener = vi.fn();
  stops.push(subscription.subscribe(listener));
  await vi.advanceTimersByTimeAsync(0);
  expect(listener.mock.lastCall?.[0]).toEqual({
    type: 'connection',
    error: 'The table could not be reached. Reconnecting...',
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(listener.mock.lastCall?.[0]).toEqual({ type: 'connection', error: 'The table is temporarily unavailable.' });
  await vi.advanceTimersByTimeAsync(1000);
  expect(subscription.status).not.toBe('authorized');
  /* Only the first attempt, before anything failed, reads as plainly connecting. */
  expect(listener.mock.calls.filter(([event]) => event.type === 'connection' && event.error === null)).toHaveLength(1);
});

test('a refusal that arrives only as the close code still says why', async () => {
  const subscription = new GameSubscription('game', async () => ({ ok: true, pass: 'pass.a' }), runtime);
  const listener = vi.fn();
  stops.push(subscription.subscribe(listener));
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  socket.close(4401);
  expect(subscription.status).toBe('denied');
  expect(listener.mock.lastCall?.[0]).toEqual({
    type: 'connection',
    error: 'This login can no longer access the table.',
  });
});

/** A table admitted with a long-lived pass, whose admission requests the test can answer differently from then on. */
async function passTable() {
  const pass = await seatPass(Date.now() + 60 * 60_000);
  const requestAdmission = vi.fn<ConstructorParameters<typeof GameSubscription>[1]>(async () => ({ ok: true, pass }));
  const subscription = new GameSubscription('game', requestAdmission, runtime, () => () => true);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  socket.deliver(initial());
  return { subscription, requestAdmission, socket };
}

test('a seat pass admits, hands a fresher one to the open socket and renews before it ends or when the room says it ran out', async () => {
  const first = await seatPass(Date.now() + 60 * 60_000);
  const fresher = await seatPass(Date.now() + 2 * 60 * 60_000);
  const requestAdmission = vi.fn(async (_gameId: string, _options?: { renew?: boolean }) => ({
    ok: true as const,
    pass: first,
  }));
  let handOver: ((pass: string) => void) | undefined;
  const watchPass = vi.fn((_gameId: string, listener: (pass: string) => void) => {
    handOver = listener;
    return () => true;
  });
  const subscription = new GameSubscription('game', requestAdmission, runtime, watchPass);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  expect(socket.sent).toEqual([{ type: 'admit', pass: first }]);
  socket.deliver(initial());
  expect(subscription.status).toBe('authorized');

  handOver!(fresher);
  expect(socket.sent.at(-1)).toEqual({ type: 'pass', pass: fresher });

  /* The room calling the pass expired asks Convex for a fresh one, whatever this browser's clock says. */
  const before = requestAdmission.mock.calls.length;
  socket.deliver({ type: 'admission', status: 'pass-expired' });
  expect(subscription.status).toBe('suspended');
  await vi.advanceTimersByTimeAsync(0);
  expect(requestAdmission).toHaveBeenCalledTimes(before + 1);
  expect(requestAdmission.mock.lastCall?.[1]).toEqual({ renew: true });

  /* Without a fresher pass arriving, the page renews five minutes before the held one ends. */
  const renewals = requestAdmission.mock.calls.length;
  await vi.advanceTimersByTimeAsync(2 * 60 * 60_000 - 5 * 60_000 - 1000);
  expect(requestAdmission).toHaveBeenCalledTimes(renewals);
  await vi.advanceTimersByTimeAsync(2000);
  expect(requestAdmission).toHaveBeenCalledTimes(renewals + 1);
  expect(Socket.instances).toHaveLength(1);
});

test('a socket closed for an expired pass reconnects with a renewed one', async () => {
  const pass = await seatPass(Date.now() + 60 * 60_000);
  const requestAdmission = vi.fn(async (_gameId: string, _options?: { renew?: boolean }) => ({
    ok: true as const,
    pass,
  }));
  const subscription = new GameSubscription('game', requestAdmission, runtime, () => () => true);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  Socket.instances.at(-1)!.open();
  Socket.instances.at(-1)!.close(PASS_EXPIRED_CLOSE_CODE);
  await vi.advanceTimersByTimeAsync(1000);
  expect(requestAdmission).toHaveBeenCalledTimes(2);
  expect(requestAdmission.mock.lastCall?.[1]).toEqual({ renew: true });
});

test('a renewal the room asked for retries after a busy answer, waiting as long as Convex says', async () => {
  const { requestAdmission, socket } = await passTable();
  requestAdmission.mockResolvedValueOnce({ ok: false, reason: 'rate_limited', retryAfterMs: 5000 } as never);
  const before = requestAdmission.mock.calls.length;
  socket.deliver({ type: 'admission', status: 'pass-expired' });
  await vi.advanceTimersByTimeAsync(4999);
  expect(requestAdmission).toHaveBeenCalledTimes(before + 1);
  await vi.advanceTimersByTimeAsync(1);
  expect(requestAdmission).toHaveBeenCalledTimes(before + 2);
});

test('a renewal Convex refuses after the room calls the pass expired ends the table instead of pausing it forever', async () => {
  const { subscription, requestAdmission, socket } = await passTable();
  requestAdmission.mockResolvedValueOnce({ ok: false, reason: 'not_authorized' } as never);
  socket.deliver({ type: 'admission', status: 'pass-expired' });
  await vi.advanceTimersByTimeAsync(0);
  expect(subscription.status).toBe('denied');
});

test('a renewal reply belongs to the connection that requested it, even when a reconnect uses the same pass', async () => {
  const { subscription, requestAdmission, socket } = await passTable();
  const renewal = Promise.withResolvers<Awaited<ReturnType<ConstructorParameters<typeof GameSubscription>[1]>>>();
  requestAdmission.mockReturnValueOnce(renewal.promise);
  socket.deliver({ type: 'admission', status: 'pass-expired' });
  socket.close();
  await vi.advanceTimersByTimeAsync(1000);
  const replacement = Socket.instances.at(-1)!;
  replacement.open();
  replacement.deliver(initial());
  expect(subscription.ready).toBe(true);
  renewal.resolve({ ok: false, reason: 'not_authorized' });
  await vi.advanceTimersByTimeAsync(0);
  expect(subscription.ready).toBe(true);
  expect(replacement.readyState).toBe(1);
});
