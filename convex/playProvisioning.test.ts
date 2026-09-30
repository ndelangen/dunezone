/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { createPendingGame } from './lib/playProvisioningSchedule';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

/* A real game as `playGames.createGame` leaves it pending: provisioning never reads its ruleset, so a bare row stands in. */
async function fixture(t = setup()) {
  const game = await t.run(async (ctx) => {
    const stamp = new Date().toISOString();
    const creatorId = await ctx.db.insert('users', { account_state: 'active' });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: '',
      created_at: stamp,
      updated_at: stamp,
      owner_id: creatorId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const gameId = await createPendingGame(ctx, { ruleset_id: rulesetId, minimum_players: 4, creator_id: creatorId });
    return await ctx.db.get(gameId);
  });
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
  test('validates without publishing, and publishes only confirmed initialization', async () => {
    const { t, game, credentials } = await fixture();
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toEqual({
      ok: true,
      gameId: game._id,
      attemptId: game.attempt_id,
      expiresAt: game.provision_expires_at,
      game: {
        rulesetId: game.ruleset_id,
        minimumPlayers: 4,
        creator: expect.objectContaining({ userId: game.creator_id }),
      },
    });
    expect(await t.run(async (ctx) => (await ctx.db.get(game._id))?.state)).toBe('pending');
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: true });
    expect(await t.run(async (ctx) => (await ctx.db.get(game._id))?.state)).toBe('ready');
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

  test('a catalogue refusal requires the current credentials and cannot replace a ready game', async () => {
    const { t, game, credentials } = await fixture();
    const reason = 'This ruleset is not ready: spice, Publish every member and back before requesting this asset.';
    for (const request of [
      { ...credentials, gameId: 'unknown' },
      { ...credentials, secret: 'c'.repeat(64) },
      { ...credentials, attemptId: 'd'.repeat(64) },
    ]) {
      expect(await t.mutation(api.playProvisioning.failProvisioning, { ...request, reason })).toEqual({ ok: false });
    }
    expect(await t.query(internal.playProvisioning.provisioningRequest, { gameId: game._id })).not.toBeNull();
    for (const invalidReason of ['', 'x'.repeat(801)]) {
      expect(
        await t.mutation(api.playProvisioning.failProvisioning, { ...credentials, reason: invalidReason })
      ).toEqual({ ok: false });
    }
    expect(await t.mutation(api.playProvisioning.failProvisioning, { ...credentials, reason })).toEqual({ ok: true });
    expect(await t.run(async (ctx) => await ctx.db.get(game._id))).toMatchObject({
      state: 'expired',
      provision_error: reason,
    });
    expect(
      await t.mutation(api.playProvisioning.failProvisioning, { ...credentials, reason: 'Another refusal' })
    ).toEqual({ ok: false });
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: false });
    expect(await t.query(internal.playProvisioning.provisioningRequest, { gameId: game._id })).toBeNull();

    const replacement = await fixture();
    await replacement.t.mutation(api.playProvisioning.confirmProvisioning, replacement.credentials);
    expect(
      await replacement.t.mutation(api.playProvisioning.failProvisioning, { ...replacement.credentials, reason })
    ).toEqual({ ok: false });
    expect(await replacement.t.run(async (ctx) => await ctx.db.get(replacement.game._id))).toMatchObject({
      state: 'ready',
    });
  });

  test('an expired attempt cannot acquire a later catalogue refusal', async () => {
    const { t, game, credentials } = await fixture();
    vi.setSystemTime(game.provision_expires_at);
    expect(await t.mutation(api.playProvisioning.failProvisioning, { ...credentials, reason: 'Too late' })).toEqual({
      ok: false,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(game._id))).not.toHaveProperty('provision_error');
  });

  test('the deadline refuses late completion before scheduled cleanup', async () => {
    const { t, game, credentials } = await fixture();
    vi.setSystemTime(game.provision_expires_at);
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toEqual({ ok: false });
    expect(await t.mutation(api.playProvisioning.confirmProvisioning, credentials)).toEqual({ ok: false });
    expect(await t.run(async (ctx) => (await ctx.db.get(game._id))?.state)).toBe('pending');
  });

  test('only a synthetic backend provisions the test phase cooldown its environment sets', async () => {
    const { t, credentials } = await fixture();
    vi.stubEnv('PLAY_TEST_PHASE_COOLDOWN_MS', '0');
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).not.toHaveProperty(
      'testPhaseCooldownMs'
    );
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toMatchObject({
      ok: true,
      testPhaseCooldownMs: 0,
    });
  });

  test('only a synthetic backend asks for the start stage its environment sets', async () => {
    const { t, credentials } = await fixture();
    vi.stubEnv('PLAY_TEST_START_STAGE', 'play');
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).not.toHaveProperty(
      'testStartStage'
    );
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toMatchObject({
      ok: true,
      testStartStage: 'play',
    });
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

  test('unauthenticated requests cannot exhaust a valid provisioning attempt', async () => {
    const { t, credentials } = await fixture();
    for (let request = 0; request < 21; request++) {
      expect(
        await t.mutation(api.playProvisioning.validateProvisioning, { ...credentials, secret: 'a'.repeat(64) })
      ).toEqual({ ok: false });
    }
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toMatchObject({ ok: true });
  });

  test('an exhausted game quota does not block replacement provisioning', async () => {
    const { t, game, credentials } = await fixture();
    vi.setSystemTime(game.provision_expires_at - 1);
    for (let request = 0; request < 20; request++) {
      expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toMatchObject({ ok: true });
    }
    expect(await t.mutation(api.playProvisioning.validateProvisioning, credentials)).toEqual({ ok: false });
    const replacement = await fixture(t);
    expect(await t.mutation(api.playProvisioning.validateProvisioning, replacement.credentials)).toMatchObject({
      ok: true,
    });
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
