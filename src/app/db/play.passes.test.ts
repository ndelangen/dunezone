import { signSeatPass } from '@shared/play/seatPass';
import { getFunctionName } from 'convex/server';
import { beforeEach, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ mutation: vi.fn() }));

vi.mock('@db/core', () => ({ db: { mutation: mocks.mutation } }));

import { rememberSeatPass, requestPlayAdmission, watchSeatPass } from './play';

function seatPass(exp: number) {
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
  });
}
const called = () => mocks.mutation.mock.calls.map(([reference]) => getFunctionName(reference));

beforeEach(() => {
  mocks.mutation.mockReset();
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
