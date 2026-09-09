/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PLAY_FIXTURE_KEY } from '../src/shared/play/admission';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function fixture(email = 'synthetic@example.invalid') {
  const t = convexTest(schema, modules);
  const rows = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email, isAdmin: true });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 60_000 });
    const refreshId = await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 60_000 });
    return { userId, sessionId, refreshId };
  });
  return { t, ...rows };
}

describe('isolated Play test controls', () => {
  test.each([
    ['IS_TEST', 'false'],
    ['E2E_LOCAL_AUTH', 'false'],
    ['CONVEX_CLOUD_URL', 'https://production.convex.cloud'],
    ['SITE_URL', 'https://dune.zone'],
  ])('refuses every control when %s is not isolated', async (key, value) => {
    const { t, userId, sessionId } = await fixture();
    const { gameId } = await t.mutation(internal.playTesting.createFixture, {});
    vi.stubEnv(key, value);
    await expect(t.mutation(internal.playTesting.createFixture, {})).rejects.toThrow('isolated loopback');
    await expect(t.mutation(internal.playTesting.retireFixture, { gameId })).rejects.toThrow('isolated loopback');
    await expect(t.mutation(internal.playTesting.setAdministrator, { userId, enabled: false })).rejects.toThrow(
      'isolated loopback'
    );
    await expect(
      t.mutation(internal.playTesting.shortenSession, { sessionId, kind: 'total', expiresInMs: 0 })
    ).rejects.toThrow('isolated loopback');
  });

  test('changes only the requested synthetic account flag', async () => {
    const { t, userId } = await fixture();
    await t.mutation(internal.playTesting.setAdministrator, { userId, enabled: false });
    expect(await t.run(async (ctx) => (await ctx.db.get(userId))?.isAdmin)).toBe(false);
    const other = await fixture('not-synthetic@example.com');
    await expect(
      other.t.mutation(internal.playTesting.setAdministrator, { userId: other.userId, enabled: false })
    ).rejects.toThrow('synthetic accounts');
  });

  test.each(['total', 'inactivity'] as const)('can shorten %s expiry but cannot renew it', async (kind) => {
    const { t, sessionId } = await fixture();
    const first = await t.mutation(internal.playTesting.shortenSession, { sessionId, kind, expiresInMs: 1000 });
    const second = await t.mutation(internal.playTesting.shortenSession, { sessionId, kind, expiresInMs: 30_000 });
    expect(first.expiresAt).toBe(Date.now() + 1000);
    expect(second).toEqual(first);
    await expect(t.mutation(internal.playTesting.shortenSession, { sessionId, kind, expiresInMs: -1 })).rejects.toThrow(
      'thirty seconds'
    );
  });

  test('creates distinct pending test games outside the singleton directory key', async () => {
    const { t } = await fixture();
    const first = await t.mutation(internal.playTesting.createFixture, {});
    const second = await t.mutation(internal.playTesting.createFixture, {});
    expect(first.gameId).not.toBe(second.gameId);
    expect(first.secret).not.toBe(second.secret);
    const row = await t.run(async (ctx) => await ctx.db.get(first.gameId));
    expect(row).toMatchObject({ state: 'pending', fixture_key: expect.stringMatching(/^synthetic-/) });
    expect(row?.fixture_key).not.toBe('hosted-demo');
  });

  test.each(['pending', 'ready', 'expired'] as const)(
    'retires a %s fixture without replacing its identity or credentials',
    async (state) => {
      const { t } = await fixture();
      const { gameId } = await t.mutation(internal.playTesting.createFixture, {});
      await t.run(async (ctx) => await ctx.db.patch(gameId, { state, fixture_key: PLAY_FIXTURE_KEY }));
      const before = await t.run(async (ctx) => await ctx.db.get(gameId));
      await t.mutation(internal.playTesting.retireFixture, { gameId });
      expect(await t.run(async (ctx) => await ctx.db.get(gameId))).toEqual({ ...before, state: 'expired' });
    }
  );

  test('accepts a synthetic fixture key but refuses another game directory', async () => {
    const { t } = await fixture();
    const first = await t.mutation(internal.playTesting.createFixture, {});
    const second = await t.mutation(internal.playTesting.createFixture, {});
    await t.run(async (ctx) => await ctx.db.patch(second.gameId, { fixture_key: 'another-game' }));
    await t.mutation(internal.playTesting.retireFixture, { gameId: first.gameId });
    await expect(t.mutation(internal.playTesting.retireFixture, { gameId: second.gameId })).rejects.toThrow('fixture');
    expect(await t.run(async (ctx) => (await ctx.db.get(second.gameId))?.state)).toBe('pending');
  });
});
