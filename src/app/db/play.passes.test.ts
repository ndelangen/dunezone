import { initialSnapshot } from '@shared/play/commands';
import { testSeatPass as seatPass } from '@shared/play/seatPass.test.fixture';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ mutation: vi.fn() }));

vi.mock('@db/core', () => ({ db: { mutation: mocks.mutation } }));

import { runtime, Socket } from '../routes/_app/play/multiplayer/gameRuntime.test.fixture';
import { GameSubscription } from '../routes/_app/play/multiplayer/GameSubscription';
import { rememberSeatPass, requestPlayAdmission, watchSeatPass } from './play';

const called = () => mocks.mutation.mock.calls.map(([reference]) => getFunctionName(reference));
const stops: (() => void)[] = [];

beforeEach(() => {
  mocks.mutation.mockReset();
});
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  vi.useRealTimers();
});

test('waits for the game query, enrols an account that has no pass yet and keeps the longer-lived pass', async () => {
  const enrolled = await seatPass(Date.now() + 60 * 60_000);
  mocks.mutation.mockResolvedValue({ ok: true, pass: enrolled });
  const seen: string[] = [];
  watchSeatPass('enrolling', (pass) => seen.push(pass));
  const admission = requestPlayAdmission('enrolling');
  rememberSeatPass('enrolling', null);
  expect(await admission).toEqual({ ok: true, pass: enrolled });
  expect(called()).toEqual(['playAdmission:enrolPlayer']);
  expect(seen).toEqual([enrolled]);

  /* A query answer signed before the enrolment's pass never replaces it. */
  rememberSeatPass('enrolling', await seatPass(Date.now() + 30 * 60_000));
  expect(await requestPlayAdmission('enrolling')).toEqual({ ok: true, pass: enrolled });
  expect(called()).toEqual(['playAdmission:enrolPlayer']);
});

test('renews a pass near its end, or when the room says it ran out, but not one Convex just signed', async () => {
  rememberSeatPass('renewing', await seatPass(Date.now() + 60_000));
  const renewed = await seatPass(Date.now() + 60 * 60_000);
  mocks.mutation.mockResolvedValue({ ok: true, pass: renewed });
  expect(await requestPlayAdmission('renewing')).toEqual({ ok: true, pass: renewed });
  expect(called()).toEqual(['playAdmission:renewSeatPass']);
  expect(await requestPlayAdmission('renewing', { renew: true })).toEqual({ ok: true, pass: renewed });
  expect(called()).toEqual(['playAdmission:renewSeatPass']);

  const current = await seatPass(Date.now() + 2 * 60 * 60_000);
  rememberSeatPass('renewing', current);
  expect(await requestPlayAdmission('renewing')).toEqual({ ok: true, pass: current });
  await requestPlayAdmission('renewing', { renew: true });
  expect(called()).toEqual(['playAdmission:renewSeatPass', 'playAdmission:renewSeatPass']);
});

test('falls back to a ticket when the deployment sends no pass', async () => {
  mocks.mutation.mockResolvedValue({ ok: true, ticket: 'a'.repeat(64), expiresInMs: 30_000 });
  rememberSeatPass('legacy', undefined);
  expect(await requestPlayAdmission('legacy')).toMatchObject({ ok: true, ticket: 'a'.repeat(64) });
  expect(called()).toEqual(['playAdmission:issueTicket']);
});

test('lets the room force a renewal once a minute has passed since Convex signed the held pass', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const renewed = await seatPass(Date.now() + 60_000);
  mocks.mutation.mockResolvedValue({ ok: true, pass: renewed });
  rememberSeatPass('forced', null);
  await requestPlayAdmission('forced');
  vi.setSystemTime(Date.now() + 61_000);
  await requestPlayAdmission('forced', { renew: true });
  expect(called()).toEqual(['playAdmission:enrolPlayer', 'playAdmission:renewSeatPass']);
});

test('replaces the held pass with one for another account or actor even when it ends sooner', async () => {
  const exp = Date.now() + 60 * 60_000;
  rememberSeatPass('merged', await seatPass(exp));
  const merged = await seatPass(exp - 1000, { actorId: 'other-actor' });
  rememberSeatPass('merged', merged);
  expect(await requestPlayAdmission('merged')).toEqual({ ok: true, pass: merged });
});

const authorizedView = () => ({
  type: 'view' as const,
  viewer: { connectionId: 'one', userId: 'user', viewerSeat: 'harkonnen', displayName: 'Player', color: '#fff' },
  epoch: 'epoch',
  sequence: 1,
  snapshot: initialSnapshot(),
  carries: [],
  pointers: [],
});

async function admittedGame(gameId: string) {
  vi.useFakeTimers();
  Socket.instances = [];
  rememberSeatPass(gameId, await seatPass(Date.now() + 60 * 60_000));
  const renewal = Promise.withResolvers<Awaited<ReturnType<typeof requestPlayAdmission>>>();
  mocks.mutation.mockReturnValueOnce(renewal.promise);
  const subscription = new GameSubscription(gameId, requestPlayAdmission, runtime, watchSeatPass);
  stops.push(subscription.subscribe(vi.fn()));
  await vi.advanceTimersByTimeAsync(0);
  const socket = Socket.instances.at(-1)!;
  socket.open();
  socket.deliver(authorizedView());
  await vi.advanceTimersByTimeAsync(55 * 60_000);
  expect(called()).toEqual(['playAdmission:renewSeatPass']);
  return { subscription, socket, renewal };
}

test('an old renewal refusal cannot deny a connection admitted with a fresh session pass', async () => {
  const gameId = 'reconnected-renewal';
  const { subscription, socket, renewal } = await admittedGame(gameId);
  socket.close();
  rememberSeatPass(gameId, await seatPass(Date.now() + 60 * 60_000, { sessionId: 'fresh-session' }));
  await vi.advanceTimersByTimeAsync(1000);
  const replacement = Socket.instances.at(-1)!;
  replacement.open();
  replacement.deliver(authorizedView());
  expect(subscription.ready).toBe(true);
  renewal.resolve({ ok: false, reason: 'not_authorized' });
  await vi.advanceTimersByTimeAsync(0);
  expect(subscription.ready).toBe(true);
  expect(replacement.readyState).toBe(1);
});

test('a failed renewal of an older pass cannot replace the fresh pass renewal timer on the same socket', async () => {
  const gameId = 'replaced-renewal';
  const { subscription, socket, renewal } = await admittedGame(gameId);
  rememberSeatPass(gameId, await seatPass(Date.now() + 60 * 60_000));
  renewal.reject(new Error('The earlier request lost its connection.'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(called()).toEqual(['playAdmission:renewSeatPass']);
  expect(subscription.ready).toBe(true);
  expect(socket.readyState).toBe(1);
  await vi.advanceTimersByTimeAsync(55 * 60_000 - 1000);
  expect(called()).toEqual(['playAdmission:renewSeatPass', 'playAdmission:renewSeatPass']);
});
