/* @vitest-environment edge-runtime */
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

async function world() {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const person = await playPerson(ctx, 'Player');
    const rulesetId = await playRuleset(ctx, person.userId);
    const gameId = await ctx.db.insert('play_games', {
      name: 'Hidden Sietch',
      slug: 'hidden-sietch',
      ruleset_id: rulesetId,
      creator_id: person.userId,
      minimum_players: 2,
      state: 'pending',
      secret: 'private-secret',
      attempt_id: 'private-attempt',
      created_at: 0,
      provision_expires_at: 100,
    });
    return { ...person, gameId };
  });
  return { t, ...seeded, player: t.withIdentity({ subject: seeded.subject }) };
}

test.each(['pending', 'expired', 'ready'] as const)(
  'friendly and ID addresses share the authorized %s game',
  async (state) => {
    const { t, player, gameId } = await world();
    await t.run(async (ctx) => ctx.db.patch(gameId, { state }));
    const byId = await player.query(api.playGames.getGameByAddress, { address: gameId });
    const bySlug = await player.query(api.playGames.getGameByAddress, { address: 'hidden-sietch' });
    expect(byId).toEqual(bySlug);
    expect(byId).toMatchObject({
      gameId,
      name: 'Hidden Sietch',
      slug: 'hidden-sietch',
      status: { pending: 'preparing', expired: 'unavailable', ready: 'ready' }[state],
    });
    expect(byId).not.toHaveProperty('secret');
    expect(byId).not.toHaveProperty('attempt_id');
    const legacy = await player.query(api.playGames.getGame, { gameId });
    expect(legacy).not.toHaveProperty('slug');
    if (state === 'pending') {
      expect(legacy).toEqual({ status: 'preparing' });
    }
  }
);

test('signed-out and inactive accounts learn no address metadata', async () => {
  const { t, player, gameId, userId } = await world();
  for (const address of [gameId, 'hidden-sietch', 'unknown']) {
    expect(await t.query(api.playGames.getGameByAddress, { address })).toEqual({ status: 'sign_in_required' });
  }
  await t.run(async (ctx) => ctx.db.patch(userId, { account_state: 'deleted' }));
  expect(await player.query(api.playGames.getGameByAddress, { address: 'hidden-sietch' })).toEqual({
    status: 'sign_in_required',
  });
});

test('reserved and unknown addresses, and denied hosted fixtures, reveal no game', async () => {
  const { t, player, gameId } = await world();
  for (const address of ['create', 'demo', 'hosted', 'unknown', 'Hidden-Sietch']) {
    expect(await player.query(api.playGames.getGameByAddress, { address })).toEqual({ status: 'not_found' });
  }
  await t.run(async (ctx) => ctx.db.patch(gameId, { ruleset_id: undefined, fixture_key: 'hosted' }));
  for (const address of [gameId, 'hidden-sietch']) {
    expect(await player.query(api.playGames.getGameByAddress, { address })).toEqual({ status: 'not_found' });
  }
});

test('a legacy ID never falls through to an address match, including after its row is removed', async () => {
  const { t, player, gameId } = await world();
  const secondId = await t.run(async (ctx) => {
    const game = (await ctx.db.get(gameId))!;
    const { _id, _creationTime: _time, ...fields } = game;
    return await ctx.db.insert('play_games', { ...fields, name: 'Other game', slug: gameId });
  });
  expect(await player.query(api.playGames.getGameByAddress, { address: gameId })).toMatchObject({ gameId });
  await t.run(async (ctx) => ctx.db.delete(gameId));
  expect(await player.query(api.playGames.getGameByAddress, { address: gameId })).toEqual({ status: 'not_found' });
  expect(secondId).not.toBe(gameId);
});

test('legacy games without names or addresses still resolve by ID', async () => {
  const { t, player, gameId } = await world();
  await t.run(async (ctx) => ctx.db.patch(gameId, { state: 'ready', name: undefined, slug: undefined }));
  expect(await player.query(api.playGames.getGameByAddress, { address: gameId })).toMatchObject({
    gameId,
    name: 'Classic',
    slug: null,
    status: 'ready',
  });
});
