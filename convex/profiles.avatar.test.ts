/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const SOURCE_URL = 'https://images.example/avatar.png';
const AVATAR_KEY = `${'a'.repeat(64)}.jpg`;
const DELIVERY_URL = `https://dune.zone/user-images/${AVATAR_KEY}`;
const STORED_AVATAR = {
  url: DELIVERY_URL,
  source_url: SOURCE_URL,
  width: 320,
  height: 320,
};

function avatarFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

function stubIngestEnvironment() {
  vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'https://worker.test');
}

/**
 * Plays the Worker's side of the token flow for avatars: reads the token out of the ingest request, stores the result through the public consuming mutation, and answers like the real Worker would.
 * A bounced consume answers 409 with the refusal message, because that status is what the backfill's classification reads.
 */
function avatarWorkerSimulation(t: ReturnType<typeof convexTest>, options: { deadHosts?: string[] } = {}) {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { source_url: string; token: string };
    if (options.deadHosts?.some((host) => body.source_url.includes(host))) {
      return new Response(JSON.stringify({ error: 'The image host answered with status 404' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const answer = await t.mutation(api.ingestTokens.consume, {
      token: body.token,
      result: { url: DELIVERY_URL, width: 320, height: 320 },
      r2_keys: [AVATAR_KEY],
    });
    if (!answer.ok) {
      return new Response(JSON.stringify({ error: `Consume refused: ${answer.reason}` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('profile avatar rehosting', () => {
  test('a save with a new external URL renders it at once, and the scheduled callback flips it to the stored avatar', async () => {
    vi.useFakeTimers();
    const t = avatarFixture();
    stubIngestEnvironment();
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Avatar author' }));
    const owner = t.withIdentity({ subject: userId });
    await owner.mutation(api.profiles.bootstrapCurrent, {});

    const fetchMock = avatarWorkerSimulation(t);
    vi.stubGlobal('fetch', fetchMock);
    const saved = await owner.mutation(api.profiles.updateCurrent, {
      username: 'AvatarAuthor',
      avatar_url: SOURCE_URL,
    });

    /* The mutation itself writes the external URL and clears any stored avatar; the mint and fetch happen after commit. */
    expect(saved.profile.avatar_url).toBe(SOURCE_URL);
    expect(saved.profile.avatar).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [request, init] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('https://worker.test/__user-images/ingest');
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    const sent = JSON.parse(String(init?.body)) as { source_url: string; token: string };
    expect(sent.source_url).toBe(SOURCE_URL);
    expect(sent.token).toMatch(/^[0-9a-f]{64}$/);
    const row = await t.run(async (ctx) => await ctx.db.get(saved.profile._id));
    expect(row?.avatar).toEqual(STORED_AVATAR);
    expect(row?.avatar_url).toBe(DELIVERY_URL);
  });

  test('the echo guard: the delivery URL round-tripping through the edit form neither mints nor disturbs the stored avatar', async () => {
    vi.useFakeTimers();
    const t = avatarFixture();
    stubIngestEnvironment();
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Echo author' }));
    const owner = t.withIdentity({ subject: userId });
    const bootstrapped = await owner.mutation(api.profiles.bootstrapCurrent, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(bootstrapped._id, { avatar: STORED_AVATAR, avatar_url: DELIVERY_URL });
    });
    const fetchMock = avatarWorkerSimulation(t);
    vi.stubGlobal('fetch', fetchMock);

    await owner.mutation(api.profiles.updateCurrent, { username: 'EchoAuthor', avatar_url: DELIVERY_URL });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).not.toHaveBeenCalled();
    const tokens = await t.run(async (ctx) => await ctx.db.query('user_image_ingest_tokens').collect());
    expect(tokens).toEqual([]);
    const row = await t.run(async (ctx) => await ctx.db.get(bootstrapped._id));
    expect(row?.avatar).toEqual(STORED_AVATAR);
    expect(row?.avatar_url).toBe(DELIVERY_URL);
  });

  test('the creation seed from the auth provider schedules the rehost and the avatar lands without a save', async () => {
    vi.useFakeTimers();
    const t = avatarFixture();
    stubIngestEnvironment();
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Seeded author' }));
    const seeded = t.withIdentity({ subject: userId, name: 'SeededAuthor', pictureUrl: SOURCE_URL });
    const fetchMock = avatarWorkerSimulation(t);
    vi.stubGlobal('fetch', fetchMock);

    const profile = await seeded.mutation(api.profiles.bootstrapCurrent, {});
    expect(profile.avatar_url).toBe(SOURCE_URL);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const row = await t.run(async (ctx) => await ctx.db.get(profile._id));
    expect(row?.avatar).toEqual(STORED_AVATAR);
    expect(row?.avatar_url).toBe(DELIVERY_URL);
  });

  test('the backfill rehosts legacy rows, reports failures, and never scans deleted or settled rows', async () => {
    const t = avatarFixture();
    stubIngestEnvironment();
    const now = new Date().toISOString();
    const ids = await t.run(async (ctx) => {
      const mk = async (name: string, patch: Record<string, unknown>) => {
        const uid = await ctx.db.insert('users', { name });
        return await ctx.db.insert('profiles', {
          user_id: uid,
          username: name,
          avatar_url: null,
          account_state: 'active',
          slug: name.toLowerCase(),
          created_at: now,
          updated_at: now,
          ...patch,
        });
      };
      return {
        legacy: await mk('LegacyRow', { avatar_url: SOURCE_URL }),
        dead: await mk('DeadRow', { avatar_url: 'https://gone.example/dead.png' }),
        deleted: await mk('DeletedRow', { avatar_url: SOURCE_URL, account_state: 'deleted' }),
        settled: await mk('SettledRow', { avatar_url: DELIVERY_URL, avatar: STORED_AVATAR }),
      };
    });
    const fetchMock = avatarWorkerSimulation(t, { deadHosts: ['gone.example'] });
    vi.stubGlobal('fetch', fetchMock);

    const summary = await t.action(internal.profileAvatars.backfillLegacyAvatars, {});

    expect(summary.rehosted).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.failed).toEqual([{ slug: 'deadrow', message: 'The image host answered with status 404' }]);
    /* Null rather than false: the scan walked to the end of the table, so there is nothing to resume from. */
    expect(summary.next_cursor).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const rehosted = await t.run(async (ctx) => await ctx.db.get(ids.legacy));
    expect(rehosted?.avatar).toEqual(STORED_AVATAR);
    const dead = await t.run(async (ctx) => await ctx.db.get(ids.dead));
    expect(dead?.avatar).toBeUndefined();
    expect(dead?.avatar_url).toBe('https://gone.example/dead.png');
    const deleted = await t.run(async (ctx) => await ctx.db.get(ids.deleted));
    expect(deleted?.avatar).toBeUndefined();
  });

  test('the backfill counts a row the user changed while the Worker was fetching as skipped, and their change wins', async () => {
    const t = avatarFixture();
    stubIngestEnvironment();
    const now = new Date().toISOString();
    const profileId = await t.run(async (ctx) => {
      const uid = await ctx.db.insert('users', { name: 'Racing author' });
      return await ctx.db.insert('profiles', {
        user_id: uid,
        username: 'RacingAuthor',
        avatar_url: SOURCE_URL,
        account_state: 'active',
        slug: 'racingauthor',
        created_at: now,
        updated_at: now,
      });
    });
    const consumeThrough = avatarWorkerSimulation(t);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        /* The user edits while the backfill is fetching, so the consume-time echo recheck bounces the stale result. */
        await t.run(async (ctx) => {
          await ctx.db.patch(profileId, { avatar_url: 'https://elsewhere.example/new.png' });
        });
        return await consumeThrough(input, init);
      })
    );

    const summary = await t.action(internal.profileAvatars.backfillLegacyAvatars, {});

    expect(summary.rehosted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toEqual([]);
    const row = await t.run(async (ctx) => await ctx.db.get(profileId));
    expect(row?.avatar).toBeUndefined();
    expect(row?.avatar_url).toBe('https://elsewhere.example/new.png');
  });
});
