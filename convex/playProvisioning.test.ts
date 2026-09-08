/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const pending = await t.mutation(internal.playProvisioning.beginFixtureProvision, {});
  const game = await t.run(async (ctx) => await ctx.db.get(pending.gameId));
  if (!game) {
    throw new Error('Missing test fixture');
  }
  const credentials = { gameId: game._id, secret: game.secret, attemptId: game.attempt_id };
  return { t, game, credentials };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('SITE_URL', 'https://dune.zone');
  vi.stubEnv('PLAY_SERVICE_URL', 'https://dune.zone');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Play provisioning', () => {
  test('reuses pending work, validates without publishing, and publishes only confirmed initialization', async () => {
    const { t, game, credentials } = await fixture();
    expect(await t.mutation(internal.playProvisioning.beginFixtureProvision, {})).toEqual({
      gameId: game._id,
      state: 'pending',
    });
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toEqual({
      ok: true,
      gameId: game._id,
      attemptId: game.attempt_id,
      fixtureKey: 'hosted-demo',
      expiresAt: game.provision_expires_at,
    });
    expect(await t.run(async (ctx) => (await ctx.db.get(game._id))?.state)).toBe('pending');
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: true });
    expect(await t.mutation(internal.playProvisioning.beginFixtureProvision, {})).toEqual({
      gameId: game._id,
      state: 'ready',
    });
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toEqual({ ok: false });
  });

  test('confirmation retries survive a lost response and later expiry cleanup without resetting the game', async () => {
    const { t, game, credentials } = await fixture();
    await t.mutation(api.playProvisioning.confirmProvisioning, credentials);
    const confirmed = await t.run(async (ctx) => await ctx.db.get(game._id));
    vi.setSystemTime(game.provision_expires_at + 1);
    await t.mutation(internal.playProvisioning.expireProvisioning, { gameId: game._id });
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: true });
    expect(await t.run(async (ctx) => await ctx.db.get(game._id))).toEqual(confirmed);
  });

  test('the deadline refuses late completion before scheduled cleanup, and retries use a new DO identity', async () => {
    const { t, game, credentials } = await fixture();
    vi.setSystemTime(game.provision_expires_at);
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toEqual({ ok: false });
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: false });
    const retry = await t.mutation(internal.playProvisioning.beginFixtureProvision, {});
    expect(retry.gameId).not.toBe(game._id);
    expect(await t.run(async (ctx) => (await ctx.db.get(game._id))?.state)).toBe('expired');
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: false });
  });

  test('wrong game, secret and attempt have one refusal shape', async () => {
    const { t, credentials } = await fixture();
    for (const request of [
      { ...credentials, gameId: 'unknown' },
      { ...credentials, secret: 'a'.repeat(64) },
      { ...credentials, attemptId: 'b'.repeat(64) },
    ]) {
      expect(await t.mutation(api.playProvisioning.validateProvisioning, request)).toEqual({ ok: false });
      expect(await t.mutation(api.playProvisioning.confirmProvisioning, request)).toEqual({ ok: false });
    }
  });

  test('the callback uses the exact configured site, a bounded request and no redirects', async () => {
    const { t, game, credentials } = await fixture();
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.playProvisioning.requestProvision, { gameId: game._id });
    expect(fetch).toHaveBeenCalledWith(
      `https://dune.zone/__play/games/${game._id}/provision`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(credentials),
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );
  });

  test.each([
    'https://dune.zone.attacker.invalid',
    'https://dune.zone/path',
    'https://user:password@dune.zone',
    'https://dune.zone?secret=x',
    'http://dune.zone',
  ])('never sends the game secret to unsafe callback configuration %s', async (serviceUrl) => {
    const { t, game } = await fixture();
    vi.stubEnv('PLAY_SERVICE_URL', serviceUrl);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.playProvisioning.requestProvision, { gameId: game._id });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('failed provisioning requests retain the same pending attempt for scheduled retry', async () => {
    const { t, game } = await fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Synthetic connection loss');
      })
    );
    await t.action(internal.playProvisioning.requestProvision, { gameId: game._id });
    expect(await t.run(async (ctx) => await ctx.db.get(game._id))).toEqual(game);
  });
});
