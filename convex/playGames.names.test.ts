/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { normalizePlayGameSlug, playGameNameSchema } from '../src/shared/play/gameNames';
import { api, internal } from './_generated/api';
import { PLAY_GAME_ADDRESS_PROBES } from './lib/playGameAddresses';
import { playGameNameVocabulary } from './lib/playGameNames';
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
    const result = await viewer.mutation(internal.playGames.createNamedGame, { ...request, name });
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
    }
  });

  test('custom spelling, apostrophes, Gom Jabbar and accented equivalents share one normalizer', async () => {
    const { create } = await world();
    const first = await create("Pául's Gom Jabbar party!");
    const second = await create('Pauls gomjabbar party');
    expect(first).toMatchObject({ name: "Pául's Gom Jabbar party!", slug: 'pauls-gomjabbar-party' });
    expect(second).toMatchObject({ name: 'Pauls gomjabbar party', slug: 'pauls-gomjabbar-party-1' });
  });

  test('numeric names advance their parent cursor and duplicates keep display wording', async () => {
    const { create } = await world();
    expect((await create('Arrakeen party-1')).slug).toBe('arrakeen-party-1');
    expect((await create('Arrakeen party')).slug).toBe('arrakeen-party');
    expect(await create('Arrakeen party')).toMatchObject({ name: 'Arrakeen party', slug: 'arrakeen-party-2' });
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
      for (let suffix = 0; suffix <= PLAY_GAME_ADDRESS_PROBES; suffix += 1) {
        await ctx.db.insert('play_game_slug_reservations', { slug: `blocked${suffix ? `-${suffix}` : ''}` });
      }
    });
    await expect(create('Blocked')).rejects.toThrow('PLAY_GAME_ADDRESS_RETRY');
    const after = await t.run(async (ctx) => ({
      games: await ctx.db.query('play_games').collect(),
      cursors: await ctx.db.query('play_game_slug_cursors').collect(),
      schedules: await ctx.db.system.query('_scheduled_functions').collect(),
      reservations: await ctx.db.query('play_game_slug_reservations').collect(),
    }));
    expect(after.games).toEqual([]);
    expect(after.cursors).toEqual([]);
    expect(after.schedules).toEqual([]);
    expect(after.reservations).toHaveLength(PLAY_GAME_ADDRESS_PROBES + 1);
    for (const name of ['One', 'Two', 'Three']) {
      await create(name);
    }
    expect(await viewer.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'rate_limited' });
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
