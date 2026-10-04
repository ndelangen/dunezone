/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { HOMEPAGE_LEASE_MS } from '../src/shared/homepage/protocol';
import { api } from './_generated/api';
import { playPerson, playTest } from './play.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function visitor() {
  const t = playTest();
  const person = await t.run((ctx) => playPerson(ctx, 'Visitor'));
  return { t, person, member: t.withIdentity({ subject: person.subject }) };
}

test('only a live signed-in visitor can issue a single-use homepage ticket', async () => {
  const { t, person, member } = await visitor();
  expect(await t.mutation(api.homepageAdmission.issueTicket, {})).toBeNull();
  const issued = await member.mutation(api.homepageAdmission.issueTicket, {});
  expect(issued).not.toBeNull();
  const admission = await t.mutation(api.homepageAdmission.redeemTicket, issued!);
  expect(admission).toEqual({ allowed: true, userKey: person.userId, leaseUntil: Date.now() + HOMEPAGE_LEASE_MS });
  expect(await t.mutation(api.homepageAdmission.redeemTicket, issued!)).toEqual({ allowed: false });
  expect(await t.run((ctx) => ctx.db.query('homepage_tickets').collect())).toEqual([]);
});

test('logout between issue and redemption cancels the editing grant', async () => {
  const { t, person, member } = await visitor();
  const issued = await member.mutation(api.homepageAdmission.issueTicket, {});
  await t.run((ctx) => ctx.db.delete(person.sessionId));
  expect(await t.mutation(api.homepageAdmission.redeemTicket, issued!)).toEqual({ allowed: false });
});

test('expired tickets cannot grant a fresh lease', async () => {
  const { t, member } = await visitor();
  const issued = await member.mutation(api.homepageAdmission.issueTicket, {});
  vi.advanceTimersByTime(HOMEPAGE_LEASE_MS + 1);
  expect(await t.mutation(api.homepageAdmission.redeemTicket, issued!)).toEqual({ allowed: false });
});

test('the editing lease cannot outlast the auth session', async () => {
  const { t, person, member } = await visitor();
  const expiry = Date.now() + 5000;
  await t.run((ctx) => ctx.db.patch(person.sessionId, { expirationTime: expiry }));
  const issued = await member.mutation(api.homepageAdmission.issueTicket, {});
  expect(await t.mutation(api.homepageAdmission.redeemTicket, issued!)).toEqual({
    allowed: true,
    userKey: person.userId,
    leaseUntil: expiry,
  });
});
