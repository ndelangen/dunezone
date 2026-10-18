import { signSeatPass } from '@shared/play/seatPass';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ mutation: vi.fn() }));

vi.mock('@db/core', () => ({ db: { mutation: mocks.mutation } }));

import { rememberSeatPass, requestPlayAdmission, watchSeatPass } from './play';

function seatPass(exp: number, identity: { principalId?: string; actorId?: string } = {}) {
  return signSeatPass('a'.repeat(64), {
    v: 1,
    gameId: 'game',
    actorId: 'user',
    principalId: 'user',
    sessionId: 'session',
    sessionCreatedAt: 0,
    issuedAt: Date.now(),
    exp,
    displayName: 'Player',
    avatarUrl: null,
    profileSlug: null,
    ...identity,
  });
}
const called = () => mocks.mutation.mock.calls.map(([reference]) => getFunctionName(reference));

beforeEach(() => {
  mocks.mutation.mockReset();
});
afterEach(() => {
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
