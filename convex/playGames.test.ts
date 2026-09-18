/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

async function person(ctx: MutationCtx, name: string, isAdmin: boolean) {
  const userId = await ctx.db.insert('users', { account_state: 'active', name, isAdmin });
  const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
  await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
  return { userId, subject: `${userId}|${sessionId}` };
}

/** A ruleset with both required decks, one of them linked to a card, plus an empty-deck ruleset and a deleted one. */
async function catalogue(ctx: MutationCtx, owner: Id<'users'>) {
  const stamp = new Date().toISOString();
  const ruleset = {
    name: 'Classic',
    about: 'The classic table, as printed.'.padEnd(60, '.'),
    created_at: stamp,
    updated_at: stamp,
    owner_id: owner,
    group_id: null,
    is_deleted: false,
    image_cover: null,
  };
  const asset = (type: 'deck' | 'card-treachery', slug: string) =>
    ctx.db.insert('assets', {
      owner_id: owner,
      type,
      data: type === 'deck' ? { name: slug, about: '', cardback: publishingDeckCardback } : { name: slug },
      slug,
      created_at: stamp,
      updated_at: stamp,
      is_deleted: false,
      group_id: null,
    });
  const link = async (rulesetId: Id<'rulesets'>, slot: 'treachery' | 'spice', assetId: Id<'assets'>) =>
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: assetId, slot });
  const card = await asset('card-treachery', 'lasgun');
  const filled = async (slug: string) => {
    const deckId = await asset('deck', slug);
    await ctx.db.insert('asset_relations', { from_asset_id: deckId, to_asset_id: card, kind: 'deck-card', count: 2 });
    return deckId;
  };
  const ready = await ctx.db.insert('rulesets', { ...ruleset, slug: 'classic' });
  await link(ready, 'treachery', await filled('treachery'));
  await link(ready, 'spice', await filled('spice'));
  const emptySpice = await ctx.db.insert('rulesets', { ...ruleset, name: 'Sparse', slug: 'sparse' });
  await link(emptySpice, 'treachery', await filled('treachery-2'));
  await link(emptySpice, 'spice', await asset('deck', 'spice-empty'));
  const unlinked = await ctx.db.insert('rulesets', { ...ruleset, name: 'Bare', slug: 'bare' });
  const deleted = await ctx.db.insert('rulesets', { ...ruleset, name: 'Retired', slug: 'retired', is_deleted: true });
  return { ready, emptySpice, unlinked, deleted };
}

async function world() {
  const t = setup();
  const seeded = await t.run(async (ctx) => {
    const admin = await person(ctx, 'Administrator', true);
    const member = await person(ctx, 'Member', false);
    return { admin, member, rulesets: await catalogue(ctx, admin.userId) };
  });
  return {
    t,
    rulesets: seeded.rulesets,
    adminId: seeded.admin.userId,
    admin: t.withIdentity({ subject: seeded.admin.subject }),
    member: t.withIdentity({ subject: seeded.member.subject }),
  };
}

async function ready(t: ReturnType<typeof setup>, gameId: Id<'play_games'>) {
  await t.run(async (ctx) => await ctx.db.patch(gameId, { state: 'ready', confirmed_at: Date.now() }));
}

describe('real games are created and entered by Administrators only', () => {
  test('creatable rulesets read for an Administrator with each deck objection, and nothing for anyone else', async () => {
    const { t, admin, member, rulesets } = await world();
    expect(await t.query(api.playGames.creatable, {})).toEqual({ access: 'unauthenticated' });
    expect(await member.query(api.playGames.creatable, {})).toEqual({ access: 'not_authorized' });
    expect(await t.query(api.playGames.access, {})).toBe('unauthenticated');
    expect(await member.query(api.playGames.access, {})).toBe('not_authorized');
    expect(await admin.query(api.playGames.access, {})).toBe('admin');
    const listing = await admin.query(api.playGames.creatable, {});
    expect(listing.access).toBe('admin');
    if (listing.access !== 'admin') {
      throw new Error('unreachable');
    }
    expect(listing.rulesets.map(({ id, objection }) => [id, objection])).toEqual([
      [rulesets.unlinked, 'No treachery deck is linked.'],
      [rulesets.ready, null],
      [rulesets.emptySpice, 'The spice deck is empty.'],
    ]);
  });

  test('creation records the ruleset, minimum and creator on a pending game that only Administrators can watch', async () => {
    const { t, admin, member, adminId, rulesets } = await world();
    const request = { rulesetId: rulesets.ready, minimumPlayers: 4 as const };
    expect(await t.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'not_authorized' });
    expect(await member.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'not_authorized' });
    for (const rulesetId of [rulesets.emptySpice, rulesets.unlinked, rulesets.deleted]) {
      expect(await admin.mutation(api.playGames.createGame, { ...request, rulesetId })).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    }
    const created = await admin.mutation(api.playGames.createGame, request);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error('unreachable');
    }
    const game = await t.run(async (ctx) => await ctx.db.get(created.gameId));
    expect(game).toMatchObject({
      state: 'pending',
      ruleset_id: rulesets.ready,
      minimum_players: 4,
      creator_id: adminId,
    });
    expect(game?.fixture_key).toBeUndefined();
    /* The Worker learns the game's shape when it validates the provisioning attempt; the secret never leaves Convex. */
    const validation = await t.mutation(api.playProvisioning.validateProvisioning, {
      gameId: created.gameId,
      secret: game!.secret,
      attemptId: game!.attempt_id,
    });
    expect(validation).toMatchObject({
      ok: true,
      game: { rulesetId: rulesets.ready, minimumPlayers: 4, creator: { userId: adminId } },
    });
    expect(validation).not.toHaveProperty('fixtureKey');
    expect(validation).not.toHaveProperty('provisional');
    /* A row that is neither the fixture nor a whole real game is refused, never provisioned as a fixture. */
    await t.run(async (ctx) => await ctx.db.patch(created.gameId, { creator_id: undefined }));
    expect(
      await t.mutation(api.playProvisioning.validateProvisioning, {
        gameId: created.gameId,
        secret: game!.secret,
        attemptId: game!.attempt_id,
      })
    ).toEqual({ ok: false });
    await t.run(async (ctx) => await ctx.db.patch(created.gameId, { creator_id: adminId }));

    expect(await t.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({ status: 'sign_in_required' });
    expect(await member.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({ status: 'not_found' });
    expect(await admin.query(api.playGames.getGame, { gameId: 'not-a-game' })).toEqual({ status: 'not_found' });
    expect(await admin.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({ status: 'preparing' });
    await ready(t, created.gameId);
    expect(await admin.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({
      status: 'ready',
      gameId: created.gameId,
      name: 'Classic',
      ruleset: { slug: 'classic', name: 'Classic' },
      minimumPlayers: 4,
    });
    await t.run(async (ctx) => await ctx.db.patch(created.gameId, { state: 'expired' }));
    expect(await admin.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({ status: 'unavailable' });
  });

  test('admission to a real game follows the Administrator gate at every step', async () => {
    const { t, admin, member, adminId, rulesets } = await world();
    const created = await admin.mutation(api.playGames.createGame, { rulesetId: rulesets.ready, minimumPlayers: 6 });
    if (!created.ok) {
      throw new Error('unreachable');
    }
    await ready(t, created.gameId);
    const game = (await t.run(async (ctx) => await ctx.db.get(created.gameId)))!;
    expect(await member.mutation(api.playAdmission.issueTicket, { gameId: created.gameId })).toEqual({
      ok: false,
      reason: 'not_authorized',
    });
    const issued = await admin.mutation(api.playAdmission.issueTicket, { gameId: created.gameId });
    if (!issued.ok) {
      throw new Error('Ticket issuance refused');
    }
    /* Administrator status lost between issuing and redeeming refuses the redemption. */
    await t.run(async (ctx) => await ctx.db.patch(adminId, { isAdmin: false }));
    const credentials = { gameId: created.gameId, secret: game.secret };
    expect(await t.mutation(api.playAdmission.redeemTicket, { ...credentials, ticket: issued.ticket })).toEqual({
      ok: false,
    });
    await t.run(async (ctx) => await ctx.db.patch(adminId, { isAdmin: true }));
    const again = await admin.mutation(api.playAdmission.issueTicket, { gameId: created.gameId });
    if (!again.ok) {
      throw new Error('Ticket issuance refused');
    }
    const admission = await t.mutation(api.playAdmission.redeemTicket, { ...credentials, ticket: again.ticket });
    if (!admission.ok) {
      throw new Error('Admission refused');
    }
    const watch = () =>
      t.query(api.playAdmission.watchAuthorizations, {
        ...credentials,
        generation: 'synthetic-generation',
        registrationIds: [admission.registrationId],
      });
    expect(await watch()).toMatchObject({ ok: true, entries: [{ allowed: true }] });
    /* Unlike the fixture, a real game revokes a player who stops being an Administrator. */
    await t.run(async (ctx) => await ctx.db.patch(adminId, { isAdmin: false }));
    expect(await watch()).toMatchObject({ ok: true, entries: [{ allowed: false }] });
  });

  test('the fixture keeps its signed-in access and reads as the hosted fixture', async () => {
    const { t, member } = await world();
    const fixture = await t.mutation(internal.playProvisioning.beginFixtureProvision, {});
    await ready(t, fixture.gameId);
    expect(await member.query(api.playGames.getGame, { gameId: fixture.gameId })).toMatchObject({
      status: 'ready',
      name: 'Hosted fixture',
      ruleset: null,
      minimumPlayers: null,
    });
    expect(await member.mutation(api.playAdmission.issueTicket, { gameId: fixture.gameId })).toMatchObject({
      ok: true,
    });
  });
});
