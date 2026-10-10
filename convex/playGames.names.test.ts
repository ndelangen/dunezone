/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { normalizePlayGameSlug, playGameNameSchema } from '../src/shared/play/gameNames';
import { api, internal } from './_generated/api';
import { hasLocalPlayGameProfanity } from './lib/playGameNameChecks';
import { playGameNameVocabulary } from './lib/playGameNames';
import { playRateLimiter } from './lib/playRateLimits';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function world() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const seeded = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Name allocator', account_state: 'active' });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
    await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
    const stamp = new Date().toISOString();
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: '',
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: stamp,
      updated_at: stamp,
    });
    const card = await ctx.db.insert('assets', {
      owner_id: userId,
      type: 'card-treachery',
      data: { name: 'Card' },
      slug: 'card',
      group_id: null,
      is_deleted: false,
      created_at: stamp,
      updated_at: stamp,
    });
    for (const slot of ['treachery', 'spice'] as const) {
      const deck = await ctx.db.insert('assets', {
        owner_id: userId,
        type: 'deck',
        data: { name: slot, about: '', cardback: publishingDeckCardback },
        slug: slot,
        group_id: null,
        is_deleted: false,
        created_at: stamp,
        updated_at: stamp,
      });
      await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: deck, slot });
      await ctx.db.insert('asset_relations', { from_asset_id: deck, to_asset_id: card, kind: 'deck-card', count: 1 });
    }
    return { rulesetId, subject: `${userId}|${sessionId}` };
  });
  const viewer = t.withIdentity({ subject: seeded.subject });
  const request = { rulesetId: seeded.rulesetId, minimumPlayers: 4 as const };
  async function create(name: string) {
    const result = await viewer.mutation(internal.playGames.createNamedGame, {
      ...request,
      name,
      base: normalizePlayGameSlug(name),
      check: { outcome: 'no_profanity_detected' },
    });
    if (!result.ok) {
      throw new Error(`Creation refused: ${result.reason}`);
    }
    return (await t.run(async (ctx) => await ctx.db.get(result.gameId)))!;
  }
  return { t, viewer, request, create };
}

describe('permanent Play names and addresses', () => {
  test('all reviewed phrases have distinct matching URL spellings and valid display names', () => {
    const vocabulary = playGameNameVocabulary();
    expect(vocabulary).toHaveLength(840);
    expect(new Set(vocabulary.map(({ name }) => name)).size).toBe(840);
    expect(new Set(vocabulary.map(({ slug }) => slug)).size).toBe(840);
    for (const { name, slug } of vocabulary) {
      expect(playGameNameSchema.parse(name)).toBe(name);
      expect(normalizePlayGameSlug(name)).toBe(slug);
      expect(hasLocalPlayGameProfanity(name)).toBe(false);
    }
  });

  test('a number standing alone spells no word, while digits inside a word still do', () => {
    for (const name of ['Top 5 hits', 'Round 5 hit list', 'Act 7 wat']) {
      expect(hasLocalPlayGameProfanity(name)).toBe(false);
      expect(hasLocalPlayGameProfanity(normalizePlayGameSlug(name))).toBe(false);
    }
    for (const name of ['5h1t storm', 'Spice b1tch', 'a55hole parade']) {
      expect(hasLocalPlayGameProfanity(name)).toBe(true);
    }
  });

  test('custom spelling, apostrophes, Gom Jabbar and accented equivalents share one normalizer', async () => {
    const { create } = await world();
    const first = await create("Pául's Gom Jabbar party!");
    const second = await create('Pauls gomjabbar party');
    expect(first).toMatchObject({ name: "Pául's Gom Jabbar party!", slug: 'pauls-gomjabbar-party' });
    expect(second).toMatchObject({ name: 'Pauls gomjabbar party', slug: 'pauls-gomjabbar-party-1' });
  });

  test('local profanity and middle-finger variants refuse creation without spending its quota', async () => {
    const { t, create, viewer, request } = await world();
    for (const name of [
      'Fuck the spice harvest',
      'W a n k e r s choose dessert',
      'Tw@t with the crossword',
      'Fúck the rules',
      'Dune 🖕',
      'Dune 🖕🏻',
      'Dune 🖕🏼',
      'Dune 🖕🏽',
      'Dune 🖕🏾',
      'Dune 🖕🏿',
      'Dune 🖕️',
    ]) {
      await expect(create(name)).rejects.toThrow('profanity_detected');
    }
    const refused = await t.run(async (ctx) => ({
      games: await ctx.db.query('play_games').collect(),
      reservations: await ctx.db.query('play_game_slug_reservations').collect(),
      schedules: await ctx.db.system.query('_scheduled_functions').collect(),
    }));
    expect(refused).toEqual({ games: [], reservations: [], schedules: [] });
    for (const name of ['Scunthorpe astronomy club', 'Assassin butterfly collection', 'Dune 🍑🍆👍']) {
      expect((await create(name)).name).toBe(name);
    }
    expect(await viewer.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  test('allocation skips a profane base-36 suffix before reserving the final URL', async () => {
    const { t, create } = await world();
    const original = await create('Dune lantern club');
    await t.run(async (ctx) => {
      await ctx.db.insert('play_game_slug_cursors', {
        base: original.slug!,
        next_suffix: Number.parseInt('fuck', 36),
      });
    });
    expect((await create('Dune lantern club')).slug).toBe('dune-lantern-club-fucl');
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query('play_game_slug_reservations')
            .withIndex('by_slug', (q) => q.eq('slug', 'dune-lantern-club-fuck'))
            .unique()
      )
    ).toBeNull();
  });

  test('independently entered suffixes are occupied addresses without interpreting their endings', async () => {
    const { create } = await world();
    expect((await create('Arrakeen party-1')).slug).toBe('arrakeen-party-1');
    expect((await create('Arrakeen party')).slug).toBe('arrakeen-party');
    expect(await create('Arrakeen party')).toMatchObject({ name: 'Arrakeen party', slug: 'arrakeen-party-2' });
  });

  test('an extreme sparse numeric name cannot strand the plain base or its later duplicates', async () => {
    const { t, create } = await world();
    const original = await create('Arrakeen surprise party');
    const numericName = 'Arrakeen surprise party-9007199254740991';
    expect(await create(numericName)).toMatchObject({
      name: numericName,
      slug: 'arrakeen-surprise-party-9007199254740991',
    });
    /* Refill this fixture's creation budget so the test reaches both duplicate allocations. */
    await t.run(async (ctx) => await playRateLimiter.reset(ctx, 'playCreatePerAccount', { key: original.creator_id! }));
    expect((await create('Arrakeen surprise party')).slug).toBe('arrakeen-surprise-party-1');
    expect((await create('Arrakeen surprise party')).slug).toBe('arrakeen-surprise-party-2');
  });

  test('duplicate suffixes stay compact across base-36 digit boundaries', async () => {
    const { t, create } = await world();
    const original = await create('Caladan dance');
    const cursorId = await t.run(
      async (ctx) =>
        await ctx.db.insert('play_game_slug_cursors', {
          base: 'caladan-dance',
          next_suffix: 9,
        })
    );
    expect((await create('Caladan dance')).slug).toBe('caladan-dance-9');
    expect((await create('Caladan dance')).slug).toBe('caladan-dance-a');
    await t.run(async (ctx) => {
      await playRateLimiter.reset(ctx, 'playCreatePerAccount', { key: original.creator_id! });
      await ctx.db.patch(cursorId, { next_suffix: 35 });
    });
    expect((await create('Caladan dance')).slug).toBe('caladan-dance-z');
    expect((await create('Caladan dance')).slug).toBe('caladan-dance-10');
  });

  test('reserved routes receive suffixes', async () => {
    const { create } = await world();
    for (const name of ['create', 'demo', 'hosted']) {
      expect((await create(name)).slug).toBe(`${name}-1`);
    }
  });

  test('a custom legacy ID cannot take over an old link, even after its record is deleted', async () => {
    const { t, create } = await world();
    const old = await create('Old game');
    /* The mock ID contains an underscore; actual ID-shaped address protection is proved on the disposable backend. */
    const base = normalizePlayGameSlug(old._id);
    expect(await create(old._id)).toMatchObject({ name: old._id, slug: base });
    await t.run(async (ctx) => await ctx.db.delete(old._id));
    expect(await create(old._id)).toMatchObject({ name: old._id, slug: `${base}-1` });
  });

  test('indexed candidate checks catch up a stale cursor across retained and numeric addresses', async () => {
    const { t, create } = await world();
    const base = await create('Arrakeen dinner');
    await t.run(async (ctx) => {
      await ctx.db.patch(base._id, { state: 'expired' });
      for (let suffix = 1; suffix <= 3; suffix += 1) {
        await ctx.db.insert('play_game_slug_reservations', { slug: `arrakeen-dinner-${suffix}` });
      }
      await ctx.db.insert('play_game_slug_cursors', { base: 'arrakeen-dinner', next_suffix: 1 });
    });
    expect((await create('Arrakeen dinner')).slug).toBe('arrakeen-dinner-4');
  });

  test('dense out-of-order addresses recover without committing a failed creation', async () => {
    const { t, create } = await world();
    await create('Arrakeen dinner');
    await t.run(async (ctx) => {
      for (let suffix = 64; suffix >= 1; suffix -= 1) {
        await ctx.db.insert('play_game_slug_reservations', { slug: `arrakeen-dinner-${suffix.toString(36)}` });
      }
      await ctx.db.insert('play_game_slug_cursors', { base: 'arrakeen-dinner', next_suffix: 33 });
    });
    const recovered = await create('Arrakeen dinner');
    const next = await create('Arrakeen dinner');
    expect(recovered.name).toBe('Arrakeen dinner');
    expect(recovered.slug).toMatch(/^arrakeen-dinner-[a-z0-9]{13}$/);
    expect(next.slug).not.toBe(recovered.slug);
  });

  test('expiration, display/ruleset edits and hard deletion retain the allocated reservation', async () => {
    const { t, request, create } = await world();
    const original = await create('Caladan picnic');
    await t.run(async (ctx) => {
      await ctx.db.patch(original._id, { state: 'ready', name: 'Another display name', attempt_id: 'retried' });
      await ctx.db.patch(request.rulesetId, { name: 'Renamed ruleset' });
    });
    expect((await t.run(async (ctx) => await ctx.db.get(original._id)))?.slug).toBe('caladan-picnic');
    await t.run(async (ctx) => await ctx.db.patch(original._id, { state: 'expired' }));
    expect((await create('Caladan picnic')).slug).toBe('caladan-picnic-1');
    await t.run(async (ctx) => await ctx.db.delete(original._id));
    expect((await create('Caladan picnic')).slug).toBe('caladan-picnic-2');
  });

  test('bounded allocation failure rolls back creation, reservations, schedules and quota', async () => {
    const { t, viewer, request, create } = await world();
    await t.run(async (ctx) => {
      for (let suffix = 0; suffix <= 4; suffix += 1) {
        await ctx.db.insert('play_game_slug_reservations', {
          slug: suffix ? `blocked-${suffix.toString(36)}` : 'blocked',
        });
      }
    });
    await t.run(async (ctx) => await ctx.db.insert('play_game_slug_reservations', { slug: 'blocked-0000000000000' }));
    const random = vi.spyOn(crypto, 'getRandomValues').mockReturnValue(new Uint32Array(2));
    try {
      await expect(create('Blocked')).rejects.toThrow('PLAY_GAME_ADDRESS_RETRY');
    } finally {
      random.mockRestore();
    }
    const after = await t.run(async (ctx) => ({
      games: await ctx.db.query('play_games').collect(),
      cursors: await ctx.db.query('play_game_slug_cursors').collect(),
      schedules: await ctx.db.system.query('_scheduled_functions').collect(),
      reservations: await ctx.db.query('play_game_slug_reservations').collect(),
    }));
    expect(after.games).toEqual([]);
    expect(after.cursors).toEqual([]);
    expect(after.schedules).toEqual([]);
    expect(after.reservations).toHaveLength(6);
    for (const name of ['One', 'Two', 'Three']) {
      await create(name);
    }
    expect(await viewer.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  test('server candidate policies cover generated creation and roll back a rejected creation budget', async () => {
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:5173');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const { t, viewer, request } = await world();
      await viewer.mutation(internal.slugAllocationTesting.seedPolicy, {});
      await expect(
        viewer.mutation(internal.slugAllocationTesting.createWithPolicy, {
          ...request,
          policy: 'reject',
        })
      ).rejects.toThrow('PLAY_GAME_ADDRESS_RETRY');
      const failed = await t.run(async (ctx) => ({
        games: await ctx.db.query('play_games').collect(),
        reservations: await ctx.db.query('play_game_slug_reservations').collect(),
        cursors: await ctx.db.query('play_game_slug_cursors').collect(),
        schedules: await ctx.db.system.query('_scheduled_functions').collect(),
      }));
      expect(failed.games).toEqual([]);
      expect(failed.reservations).toEqual([]);
      expect(failed.cursors.map(({ base }) => base)).toEqual(['policy-dinner']);
      expect(failed.schedules).toEqual([]);
      for (const policy of ['word', 'generated', 'window'] as const) {
        const result = await viewer.mutation(internal.slugAllocationTesting.createWithPolicy, { ...request, policy });
        if (!result.ok) {
          throw new Error(`Creation refused: ${result.reason}`);
        }
        const game = await t.run(async (ctx) => await ctx.db.get(result.gameId));
        expect(game?.slug).toMatch(policy === 'word' ? /^policy-dinner-bae$/ : /-[a-z0-9]{13}$/);
        if (policy === 'generated') {
          expect(game?.name).toBe('Arrakeen surprise party');
        }
      }
      expect(await viewer.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'rate_limited' });
    } finally {
      random.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  test('invalid names fail atomically and long names retain display wording with bounded addresses', async () => {
    const { create } = await world();
    for (const name of ['', '   ', '\u200bhidden', 'a'.repeat(81), '東京', '😀']) {
      await expect(create(name)).rejects.toThrow();
    }
    const long = 'A'.repeat(80);
    expect(await create(long)).toMatchObject({ name: long, slug: 'a'.repeat(64) });
    expect(await create(long)).toMatchObject({ name: long, slug: `${'a'.repeat(64)}-1` });
  });

  test('generated-name collisions redraw a bounded number of times before numeric allocation', async () => {
    const { t, viewer, request, create } = await world();
    await create('Arrakeen surprise party');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const result = await viewer.mutation(api.playGames.createGame, request);
      if (!result.ok) {
        throw new Error('Creation refused');
      }
      const game = await t.run(async (ctx) => await ctx.db.get(result.gameId));
      expect(game).toMatchObject({ name: 'Arrakeen surprise party', slug: 'arrakeen-surprise-party-1' });
    } finally {
      random.mockRestore();
    }
  });

  test('legacy creation keeps its request and response while assigning a reviewed name', async () => {
    const { t, viewer, request } = await world();
    const result = await viewer.mutation(api.playGames.createGame, request);
    if (!result.ok) {
      throw new Error('Creation refused');
    }
    const game = await t.run(async (ctx) => await ctx.db.get(result.gameId));
    expect(playGameNameVocabulary().some(({ name }) => name === game?.name)).toBe(true);
    expect(game?.slug).toBe(normalizePlayGameSlug(game!.name!));
  });
});
