/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import type { PlayDirectorySummary } from '../src/shared/play/directory';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function person(ctx: MutationCtx, name: string, isAdmin: boolean, accountState: 'active' | 'deleted' = 'active') {
  const userId = await ctx.db.insert('users', { account_state: accountState, name, isAdmin });
  const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
  await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
  const stamp = new Date().toISOString();
  await ctx.db.insert('profiles', {
    user_id: userId,
    username: name,
    avatar_url: null,
    account_state: accountState,
    slug: name.toLowerCase(),
    created_at: stamp,
    updated_at: stamp,
  });
  return { userId, subject: `${userId}|${sessionId}` };
}

/** One ready ruleset with both decks linked, as the creation page requires. */
async function ruleset(ctx: MutationCtx, owner: Id<'users'>) {
  const stamp = new Date().toISOString();
  const rulesetId = await ctx.db.insert('rulesets', {
    name: 'Classic',
    about: 'The classic table, as printed.'.padEnd(60, '.'),
    created_at: stamp,
    updated_at: stamp,
    owner_id: owner,
    group_id: null,
    is_deleted: false,
    image_cover: null,
    slug: 'classic',
  });
  const card = await ctx.db.insert('assets', {
    owner_id: owner,
    type: 'card-treachery',
    data: { name: 'lasgun' },
    slug: 'lasgun',
    created_at: stamp,
    updated_at: stamp,
    is_deleted: false,
    group_id: null,
  });
  for (const slot of ['treachery', 'spice'] as const) {
    const deckId = await ctx.db.insert('assets', {
      owner_id: owner,
      type: 'deck',
      data: { name: slot, about: '', cardback: publishingDeckCardback },
      slug: slot,
      created_at: stamp,
      updated_at: stamp,
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('asset_relations', { from_asset_id: deckId, to_asset_id: card, kind: 'deck-card', count: 2 });
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: deckId, slot });
  }
  return rulesetId;
}

async function world() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const seeded = await t.run(async (ctx) => {
    const admin = await person(ctx, 'Administrator', true);
    const member = await person(ctx, 'Member', false);
    const gone = await person(ctx, 'Departed', false, 'deleted');
    return { admin, member, gone, rulesetId: await ruleset(ctx, admin.userId) };
  });
  const admin = t.withIdentity({ subject: seeded.admin.subject });
  const created = await admin.mutation(api.playGames.createGame, { rulesetId: seeded.rulesetId, minimumPlayers: 4 });
  if (!created.ok) {
    throw new Error('Game not created');
  }
  const game = (await t.run(async (ctx) => {
    await ctx.db.patch(created.gameId, { state: 'ready', confirmed_at: Date.now() });
    return await ctx.db.get(created.gameId);
  }))!;
  const publish = (sequence: number, summary: PlayDirectorySummary, secret = game.secret) =>
    t.mutation(api.playDirectory.publishSummary, { gameId: game._id, secret, sequence, summary });
  const summary = (seats: string[], extra: Partial<PlayDirectorySummary> = {}): PlayDirectorySummary => ({
    stage: 'drafting',
    seats: seats.map((userId, index) => ({ seat: `seat-${index + 1}`, userId, faction: null })),
    phase: null,
    lastActivityAt: 1000,
    result: null,
    ...extra,
  });
  return {
    t,
    admin,
    member: t.withIdentity({ subject: seeded.member.subject }),
    ids: { admin: seeded.admin.userId, member: seeded.member.userId, gone: seeded.gone.userId },
    game,
    publish,
    summary,
  };
}

describe('the directory keeps the newest published summary and lists it to Administrators', () => {
  test('a later sequence replaces, an older or repeated one is acknowledged without effect, a wrong secret is refused', async () => {
    const { t, admin, ids, game, publish, summary } = await world();
    expect(await publish(1, summary([ids.admin]), 'f'.repeat(64))).toEqual({ ok: false });
    expect(await publish(2, summary([ids.admin], { lastActivityAt: 2000 }))).toEqual({ ok: true, sequence: 2 });
    /* Delayed and duplicate deliveries answer with the sequence held, and change nothing. */
    expect(await publish(1, summary([ids.admin, ids.member]))).toEqual({ ok: true, sequence: 2 });
    expect(await publish(2, summary([ids.admin, ids.member]))).toEqual({ ok: true, sequence: 2 });
    const held = await t.run(async (ctx) => await ctx.db.get(game._id));
    expect(held?.directory_sequence).toBe(2);
    expect(held?.directory?.seats).toHaveLength(1);
    expect(await publish(3, summary([ids.admin, ids.member], { lastActivityAt: 3000 }))).toEqual({
      ok: true,
      sequence: 3,
    });
    const lobby = await admin.query(api.playDirectory.listGames, {});
    expect(lobby).toMatchObject({
      status: 'ready',
      past: [],
      ongoing: [
        {
          gameId: game._id,
          name: 'Classic',
          stage: 'drafting',
          seatsFilled: 2,
          seatCount: 4,
          viewerSeated: true,
          players: [
            { displayName: 'Administrator', faction: null },
            { displayName: 'Member', faction: null },
          ],
          lastActivityAt: 3000,
        },
      ],
    });
  });

  test('names come from current profiles, so a deleted account never appears and a finished game moves to past', async () => {
    const { t, admin, member, ids, game, publish, summary } = await world();
    await publish(1, summary([ids.admin, ids.gone]));
    expect(await t.query(api.playDirectory.listGames, {})).toEqual({ status: 'sign_in_required' });
    expect(await member.query(api.playDirectory.listGames, {})).toEqual({ status: 'not_authorized' });
    const listed = await admin.query(api.playDirectory.listGames, {});
    expect(listed).toMatchObject({ ongoing: [{ seatsFilled: 1, players: [{ displayName: 'Administrator' }] }] });
    const result = { kind: 'faction' as const, factionIds: ['atreides'], declaredBy: ids.admin, declaredAt: 5000 };
    await publish(2, summary([ids.admin], { stage: 'finished', result, lastActivityAt: 5000 }));
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      ongoing: [],
      past: [{ gameId: game._id, stage: 'finished', result }],
    });
    /* Continue playing after a delayed finish: the newer sequence wins whichever arrives last. */
    await publish(3, summary([ids.admin], { stage: 'play', phase: 12, lastActivityAt: 6000 }));
    expect(await publish(2, summary([ids.admin], { stage: 'finished', result }))).toEqual({ ok: true, sequence: 3 });
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      past: [],
      ongoing: [{ stage: 'play', phase: 12 }],
    });
  });
});
