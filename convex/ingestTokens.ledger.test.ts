/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const ABOUT = 'A test ruleset with a description long enough to satisfy the fifty character floor.';
const SOURCE_URL = 'https://images.example/cover.png';
const FULL_KEY = `${'a'.repeat(64)}.jpg`;
const THUMB_KEY = `${'b'.repeat(64)}.jpg`;
const RESULT = {
  url: `https://dune.zone/user-images/${FULL_KEY}`,
  thumb_url: `https://dune.zone/user-images/${THUMB_KEY}`,
  width: 800,
  height: 600,
};

async function ledgerFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Ledger owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'LedgerRuleset',
    about: ABOUT,
    image_cover: null,
  });
  const minted = await t.mutation(internal.ingestTokens.mint, {
    capability: { kind: 'ruleset_cover', ruleset_id: ruleset._id },
    source_url: SOURCE_URL,
  });
  return { t, ruleset, token: minted.token };
}

const AVATAR_SOURCE_URL = 'https://images.example/avatar.png';
const AVATAR_KEY = `${'f'.repeat(64)}.jpg`;
const AVATAR_RESULT = {
  url: `https://dune.zone/user-images/${AVATAR_KEY}`,
  width: 320,
  height: 320,
};

/** A profile still carrying its external URL, plus a minted avatar token pinned to that source. */
async function avatarLedgerFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const now = new Date().toISOString();
  const profileId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Avatar owner' });
    return await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'AvatarOwner',
      avatar_url: AVATAR_SOURCE_URL,
      account_state: 'active',
      slug: 'avatarowner',
      created_at: now,
      updated_at: now,
    });
  });
  const minted = await t.mutation(internal.ingestTokens.mint, {
    capability: { kind: 'profile_avatar', profile_id: profileId },
    source_url: AVATAR_SOURCE_URL,
  });
  return { t, profileId, token: minted.token };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ingest token ledger', () => {
  test('a minted token checks valid with its recipe kind, the check never consumes, and consume still works after any number of checks', async () => {
    const { t, ruleset, token } = await ledgerFixture();

    expect(await t.query(api.ingestTokens.check, { token, now: Date.now() })).toEqual({
      valid: true,
      kind: 'ruleset_cover',
    });
    expect(await t.query(api.ingestTokens.check, { token, now: Date.now() })).toEqual({
      valid: true,
      kind: 'ruleset_cover',
    });

    const answer = await t.mutation(api.ingestTokens.consume, {
      token,
      result: RESULT,
      r2_keys: [FULL_KEY, THUMB_KEY],
    });
    expect(answer).toEqual({ ok: true });
    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual({ ...RESULT, source_url: SOURCE_URL });
    expect(row?.image_cover).toBe(RESULT.url);
  });

  test('a garbage token checks invalid without throwing', async () => {
    const { t } = await ledgerFixture();
    expect(await t.query(api.ingestTokens.check, { token: 'not-a-token', now: Date.now() })).toEqual({ valid: false });
    expect(await t.query(api.ingestTokens.check, { token: 'f'.repeat(64), now: Date.now() })).toEqual({
      valid: false,
    });
  });

  test('an expired token is refused by check and consume, and the sweep deletes only the unconsumed row', async () => {
    vi.useFakeTimers();
    const { t, ruleset, token } = await ledgerFixture();
    const pastExpiry = Date.now() + 16 * 60 * 1000;

    expect(await t.query(api.ingestTokens.check, { token, now: pastExpiry })).toEqual({ valid: false });

    vi.setSystemTime(pastExpiry);
    const answer = await t.mutation(api.ingestTokens.consume, {
      token,
      result: RESULT,
      r2_keys: [FULL_KEY, THUMB_KEY],
    });
    expect(answer).toEqual({ ok: false, reason: 'expired' });
    const untouched = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(untouched?.cover).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run(async (ctx) => await ctx.db.query('user_image_ingest_tokens').collect());
    expect(rows).toEqual([]);
  });

  test('consume burns the token into a tombstone carrying the R2 keys, and a replay bounces', async () => {
    const { t, ruleset, token } = await ledgerFixture();

    expect(
      await t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [FULL_KEY, THUMB_KEY] })
    ).toEqual({ ok: true });

    const tombstone = await t.run(
      async (ctx) =>
        await ctx.db
          .query('user_image_ingest_tokens')
          .withIndex('by_token_id', (q) => q.eq('token_id', token))
          .unique()
    );
    expect(tombstone?.consumed).toBe(true);
    expect(tombstone?.r2_keys).toEqual([FULL_KEY, THUMB_KEY]);
    expect(await t.query(api.ingestTokens.check, { token, now: Date.now() })).toEqual({ valid: false });

    const replay = await t.mutation(api.ingestTokens.consume, {
      token,
      result: { ...RESULT, url: `https://dune.zone/user-images/${'c'.repeat(64)}.jpg` },
      r2_keys: [`${'c'.repeat(64)}.jpg`],
    });
    expect(replay).toEqual({ ok: false, reason: 'consumed' });
    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual({ ...RESULT, source_url: SOURCE_URL });
  });

  test('two racing consumes end with one winner and one bounce', async () => {
    const { t, ruleset, token } = await ledgerFixture();
    const rival = {
      url: `https://dune.zone/user-images/${'d'.repeat(64)}.jpg`,
      thumb_url: `https://dune.zone/user-images/${'e'.repeat(64)}.jpg`,
      width: 640,
      height: 480,
    };

    const [first, second] = await Promise.all([
      t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [FULL_KEY, THUMB_KEY] }),
      t.mutation(api.ingestTokens.consume, {
        token,
        result: rival,
        r2_keys: [`${'d'.repeat(64)}.jpg`, `${'e'.repeat(64)}.jpg`],
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([{ ok: false, reason: 'consumed' }]);
    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    const winner = first.ok ? RESULT : rival;
    expect(row?.cover).toEqual({ ...winner, source_url: SOURCE_URL });
  });

  test('consume holds the payload floor and a refused payload does not burn the token', async () => {
    const { t, token } = await ledgerFixture();

    const foreign = await t.mutation(api.ingestTokens.consume, {
      token,
      result: { ...RESULT, url: 'https://evil.example/anything.jpg' },
      r2_keys: [FULL_KEY, THUMB_KEY],
    });
    expect(foreign).toEqual({ ok: false, reason: 'invalid_payload' });
    const badKeys = await t.mutation(api.ingestTokens.consume, {
      token,
      result: RESULT,
      r2_keys: ['../escape.jpg'],
    });
    expect(badKeys).toEqual({ ok: false, reason: 'invalid_payload' });

    expect(
      await t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [FULL_KEY, THUMB_KEY] })
    ).toEqual({ ok: true });
  });

  test('an avatar token checks with its own kind and its consume lands the avatar and the legacy echo', async () => {
    const { t, profileId, token } = await avatarLedgerFixture();

    expect(await t.query(api.ingestTokens.check, { token, now: Date.now() })).toEqual({
      valid: true,
      kind: 'profile_avatar',
    });

    const answer = await t.mutation(api.ingestTokens.consume, {
      token,
      result: AVATAR_RESULT,
      r2_keys: [AVATAR_KEY],
    });
    expect(answer).toEqual({ ok: true });
    const row = await t.run(async (ctx) => await ctx.db.get(profileId));
    expect(row?.avatar).toEqual({ ...AVATAR_RESULT, source_url: AVATAR_SOURCE_URL });
    expect(row?.avatar_url).toBe(AVATAR_RESULT.url);
  });

  test('the avatar consume floor holds square dims, the single key and the shape, and a refusal does not burn the token', async () => {
    const { t, profileId, token } = await avatarLedgerFixture();

    const rectangular = await t.mutation(api.ingestTokens.consume, {
      token,
      result: { ...AVATAR_RESULT, height: 240 },
      r2_keys: [AVATAR_KEY],
    });
    expect(rectangular).toEqual({ ok: false, reason: 'invalid_payload' });
    const oversized = await t.mutation(api.ingestTokens.consume, {
      token,
      result: { ...AVATAR_RESULT, width: 640, height: 640 },
      r2_keys: [AVATAR_KEY],
    });
    expect(oversized).toEqual({ ok: false, reason: 'invalid_payload' });
    const twoKeys = await t.mutation(api.ingestTokens.consume, {
      token,
      result: AVATAR_RESULT,
      r2_keys: [AVATAR_KEY, `${'e'.repeat(64)}.jpg`],
    });
    expect(twoKeys).toEqual({ ok: false, reason: 'invalid_payload' });
    const coverShaped = await t.mutation(api.ingestTokens.consume, {
      token,
      result: { ...AVATAR_RESULT, thumb_url: `https://dune.zone/user-images/${'e'.repeat(64)}.jpg` },
      r2_keys: [AVATAR_KEY],
    });
    expect(coverShaped).toEqual({ ok: false, reason: 'invalid_payload' });

    const untouched = await t.run(async (ctx) => await ctx.db.get(profileId));
    expect(untouched?.avatar).toBeUndefined();
    expect(await t.mutation(api.ingestTokens.consume, { token, result: AVATAR_RESULT, r2_keys: [AVATAR_KEY] })).toEqual(
      { ok: true }
    );
  });

  test('an avatar consume whose row moved on is superseded, burning the token without touching the row', async () => {
    const { t, profileId, token } = await avatarLedgerFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(profileId, { avatar_url: 'https://elsewhere.example/newer.png' });
    });

    const answer = await t.mutation(api.ingestTokens.consume, {
      token,
      result: AVATAR_RESULT,
      r2_keys: [AVATAR_KEY],
    });

    expect(answer).toEqual({ ok: false, reason: 'superseded' });
    const row = await t.run(async (ctx) => await ctx.db.get(profileId));
    expect(row?.avatar).toBeUndefined();
    expect(row?.avatar_url).toBe('https://elsewhere.example/newer.png');
    const tombstone = await t.run(
      async (ctx) =>
        await ctx.db
          .query('user_image_ingest_tokens')
          .withIndex('by_token_id', (q) => q.eq('token_id', token))
          .unique()
    );
    expect(tombstone?.consumed).toBe(true);
    expect(tombstone?.r2_keys).toEqual([AVATAR_KEY]);
  });

  test('a consume for a deleted target still records the keys on the tombstone', async () => {
    const { t, ruleset, token } = await ledgerFixture();
    await t.run(async (ctx) => {
      await ctx.db.delete(ruleset._id);
    });

    const answer = await t.mutation(api.ingestTokens.consume, {
      token,
      result: RESULT,
      r2_keys: [FULL_KEY, THUMB_KEY],
    });

    expect(answer).toEqual({ ok: false, reason: 'entity_gone' });
    const tombstone = await t.run(
      async (ctx) =>
        await ctx.db
          .query('user_image_ingest_tokens')
          .withIndex('by_token_id', (q) => q.eq('token_id', token))
          .unique()
    );
    expect(tombstone?.consumed).toBe(true);
    expect(tombstone?.r2_keys).toEqual([FULL_KEY, THUMB_KEY]);
  });
});
