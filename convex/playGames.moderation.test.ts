/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, describe, expect, test, vi } from 'vitest';

import { PLAY_SEAT_LIMIT } from '../src/shared/play/seatLimit';
import { api, internal } from './_generated/api';
import { PLAY_NAME_CHECK_MODEL } from './lib/playGameNameProvider';
import { insertPendingGame } from './lib/playProvisioningSchedule';
import { playRateLimiter } from './lib/playRateLimits';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

async function world() {
  const t = playTest();
  const person = await t.run(async (ctx) => await playPerson(ctx, 'Name-check player'));
  const rulesetId = await t.run(async (ctx) => await playRuleset(ctx, person.userId));
  const viewer = t.withIdentity({ subject: person.subject });
  const request = { rulesetId, minimumPlayers: 4 as const, name: 'Dune lantern parade' };
  return { t, viewer, person, request };
}

function answer(probability: number) {
  return Response.json({
    model: PLAY_NAME_CHECK_MODEL,
    answers: { contains_profanity: { type: 'noul', noul: probability } },
  });
}

async function writes(t: ReturnType<typeof playTest>) {
  return await t.run(async (ctx) => ({
    games: await ctx.db.query('play_games').collect(),
    reservations: await ctx.db.query('play_game_slug_reservations').collect(),
    schedules: await ctx.db.system.query('_scheduled_functions').collect(),
  }));
}

async function creationCapacity(t: ReturnType<typeof playTest>, userId: string) {
  return await t.run(
    async (ctx) => await playRateLimiter.check(ctx, 'playCreatePerAccount', { key: userId, count: 3 })
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('server-owned game-name moderation', () => {
  test('a valid uncertain answer keeps the normalized display name and spends one creation token', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    const { t, viewer, person, request } = await world();
    const fetchMock = vi.fn(async () => answer(0.24));
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'info');
    const result = await viewer.action(api.playGames.createGameWithName, { ...request, name: '  Dune soirée  17 ' });
    expect(result).toMatchObject({
      ok: true,
      name: 'Dune soirée 17',
      slug: 'dune-soiree-17',
      moderation: 'no_profanity_detected',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: PLAY_NAME_CHECK_MODEL,
      state: { display_name: 'Dune soirée 17', normalized_base: 'dune-soiree-17', url_candidate: 'dune-soiree-17' },
    });
    expect(Object.keys(JSON.parse(init.body as string).state).sort()).toEqual([
      'display_name',
      'normalized_base',
      'url_candidate',
    ]);
    expect(JSON.stringify(init.body)).not.toContain(person.userId);
    expect(log).not.toHaveBeenCalled();
    expect((await creationCapacity(t, person.userId)).ok).toBe(false);
    const saved = await writes(t);
    expect(saved.games).toHaveLength(1);
    expect(saved.schedules).toHaveLength(5);
  });

  test('provider detection refuses without insertion, scheduling, reservations or spent creation quota', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    const { t, viewer, person, request } = await world();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(0.8))
    );
    expect(
      await viewer.action(api.playGames.createGameWithName, { ...request, name: 'Bloody hell we lost again' })
    ).toEqual({ ok: false, reason: 'profanity_detected' });
    expect(await writes(t)).toEqual({ games: [], reservations: [], schedules: [] });
    expect((await creationCapacity(t, person.userId)).ok).toBe(true);
  });

  test.each([
    'Dick plays chess',
    'Cock the lasgun',
    'Ass rescue society',
    'Prick the spice balloon',
    'Bastard sword fencing club',
  ])('ambiguous wording in %s reaches context classification', async (name) => {
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    const { viewer, request } = await world();
    const fetchMock = vi.fn(async () => answer(0.1));
    vi.stubGlobal('fetch', fetchMock);
    expect(await viewer.action(api.playGames.createGameWithName, { ...request, name })).toMatchObject({
      ok: true,
      name,
      moderation: 'no_profanity_detected',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('a local positive blocks during a provider outage and never issues the request', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    const { t, viewer, person, request } = await world();
    const fetchMock = vi.fn(async () => {
      throw new Error('outage');
    });
    vi.stubGlobal('fetch', fetchMock);
    for (const name of ['Dune 🖕🏽', 'W a n k e r s choose dessert', 'Tw@t with the crossword']) {
      expect(await viewer.action(api.playGames.createGameWithName, { ...request, name })).toEqual({
        ok: false,
        reason: 'profanity_detected',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await writes(t)).toEqual({ games: [], reservations: [], schedules: [] });
    expect((await creationCapacity(t, person.userId)).ok).toBe(true);
  });

  test.each([
    ['billing', () => new Response('secret-provider-payload', { status: 402 })],
    ['credentials', () => new Response('secret-provider-payload', { status: 401 })],
    ['rate_limit', () => new Response('secret-provider-payload', { status: 429 })],
    ['transport', () => new Response('secret-provider-payload', { status: 503 })],
    [
      'transport',
      () => {
        throw new Error('secret-provider-payload');
      },
    ],
    ['unusable_response', () => new Response('not JSON')],
    [
      'unusable_response',
      () => Response.json({ model: 'another-model', answers: { contains_profanity: { type: 'noul', noul: 0.9 } } }),
    ],
    [
      'unusable_response',
      () =>
        Response.json({ model: PLAY_NAME_CHECK_MODEL, answers: { contains_profanity: { type: 'score', noul: 0.9 } } }),
    ],
    ['unusable_response', () => answer(1.1)],
    ['unusable_response', () => answer(-0.1)],
    ['unusable_response', () => answer(Number.NaN)],
    ['unusable_response', () => new Response(' '.repeat(20_000))],
  ] as const)(
    'unavailable %s checking preserves the supplied valid name and logs only safe metadata',
    async (reason, response) => {
      vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
      const { t, viewer, request } = await world();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response())
      );
      const log = vi.spyOn(console, 'info').mockImplementation(() => {});
      const result = await viewer.action(api.playGames.createGameWithName, request);
      expect(result).toMatchObject({
        ok: true,
        name: request.name,
        slug: 'dune-lantern-parade',
        moderation: 'check_unavailable',
      });
      expect(log).toHaveBeenCalledExactlyOnceWith({
        event: 'play_name_check_unavailable_accepted',
        model: PLAY_NAME_CHECK_MODEL,
        reason,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(request.name);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-test-key');
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-provider-payload');
      expect((await writes(t)).games).toHaveLength(1);
    }
  );

  test.each(['request', 'body'] as const)(
    'the deadline bounds a stalled %s while retaining the name',
    async (phase) => {
      vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
      const { viewer, request } = await world();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          started();
          if (phase === 'request') {
            return await new Promise<Response>(() => {});
          }
          return new Response(new ReadableStream());
        })
      );
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const pending = viewer.action(api.playGames.createGameWithName, request);
      await ready;
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toMatchObject({ ok: true, name: request.name, moderation: 'check_unavailable' });
    }
  );

  test('a missing key or exhausted checking capacity permits a valid custom name without HTTP', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const { t, viewer, person, request } = await world();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await viewer.action(api.playGames.createGameWithName, request)).toMatchObject({
      ok: true,
      moderation: 'check_unavailable',
    });
    await t.run(async (ctx) => {
      await playRateLimiter.reset(ctx, 'playNameCheckPerAccount', { key: person.userId });
      await playRateLimiter.limit(ctx, 'playNameCheckPerAccount', { key: person.userId, count: 3 });
    });
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    expect(await viewer.action(api.playGames.createGameWithName, request)).toMatchObject({
      ok: true,
      slug: 'dune-lantern-parade-1',
      moderation: 'check_unavailable',
    });
    expect(await viewer.action(api.playGames.createGameWithName, { ...request, name: 'Dune 🖕' })).toEqual({
      ok: false,
      reason: 'profanity_detected',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('unavailable checking still skips a profane collision suffix without changing the supplied name', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    const { t, viewer, request } = await world();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 402 }))
    );
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await viewer.action(api.playGames.createGameWithName, request)).toMatchObject({
      ok: true,
      slug: 'dune-lantern-parade',
      moderation: 'check_unavailable',
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('play_game_slug_cursors', {
        base: 'dune-lantern-parade',
        next_suffix: Number.parseInt('fuck', 36),
      });
    });
    expect(await viewer.action(api.playGames.createGameWithName, request)).toMatchObject({
      ok: true,
      name: request.name,
      slug: 'dune-lantern-parade-fucl',
      moderation: 'check_unavailable',
    });
    const saved = await writes(t);
    expect(saved.games).toHaveLength(2);
    expect(saved.reservations.map(({ slug }) => slug)).not.toContain('dune-lantern-parade-fuck');
  });

  test('authorization, invalid names and unavailable rulesets refuse before paid checking', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
    const { t, viewer, person, request } = await world();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await t.action(api.playGames.createGameWithName, request)).toEqual({ ok: false, reason: 'not_authorized' });
    for (const name of ['', '你好', '🖕', '\u200bhidden']) {
      expect(await viewer.action(api.playGames.createGameWithName, { ...request, name })).toEqual({
        ok: false,
        reason: 'invalid_name',
      });
    }
    await t.run(async (ctx) => await ctx.db.patch(request.rulesetId, { is_deleted: true }));
    expect(await viewer.action(api.playGames.createGameWithName, request)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await creationCapacity(t, person.userId)).ok).toBe(true);
    expect(await writes(t)).toEqual({ games: [], reservations: [], schedules: [] });
  });

  test.each(['session', 'ruleset', 'seats', 'quota'] as const)(
    'the final mutation rechecks %s after the provider call',
    async (changed) => {
      vi.stubEnv('TYPESAFE_API_KEY', 'private-test-key');
      const { t, viewer, person, request } = await world();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          await t.run(async (ctx) => {
            if (changed === 'session') {
              await ctx.db.patch(person.refreshId, { expirationTime: Date.now() - 1 });
            } else if (changed === 'ruleset') {
              await ctx.db.patch(request.rulesetId, { is_deleted: true });
            } else if (changed === 'seats') {
              for (let index = 0; index < PLAY_SEAT_LIMIT; index += 1) {
                await insertPendingGame(ctx, {
                  ruleset_id: request.rulesetId,
                  creator_id: person.userId,
                  minimum_players: 4,
                });
              }
            } else {
              await playRateLimiter.limit(ctx, 'playCreatePerAccount', { key: person.userId, count: 3 });
            }
          });
          return answer(0.1);
        })
      );
      const reason = { session: 'not_authorized', ruleset: 'unavailable', seats: 'seat_limit', quota: 'rate_limited' }[
        changed
      ];
      expect(await viewer.action(api.playGames.createGameWithName, request)).toEqual({ ok: false, reason });
      expect((await writes(t)).games).toHaveLength(changed === 'seats' ? PLAY_SEAT_LIMIT : 0);
      if (changed !== 'quota') {
        expect((await creationCapacity(t, person.userId)).ok).toBe(true);
      }
    }
  );

  test('the commit rejects wording that differs from the server-checked base', async () => {
    const { t, viewer, person, request } = await world();
    expect(
      await viewer.mutation(internal.playGames.createNamedGame, {
        ...request,
        base: 'another-name',
        check: { outcome: 'check_unavailable', reason: 'transport' },
      })
    ).toEqual({ ok: false, reason: 'invalid_name' });
    expect((await creationCapacity(t, person.userId)).ok).toBe(true);
    expect(await writes(t)).toEqual({ games: [], reservations: [], schedules: [] });
  });
});
