/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import type { z } from 'zod';

import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import {
  PLAY_DISPLAY_NAME_MAX_LENGTH,
  PLAY_FIXTURE_KEY,
  PLAY_PROFILE_SLUG_MAX_LENGTH,
} from '../src/shared/play/admission';
import type { playStageSchema } from '../src/shared/play/admission';
import { PLAY_SEAT_LIMIT } from '../src/shared/play/participation';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { insertPendingGame } from './lib/playProvisioningSchedule';
import { playRateLimiter } from './lib/playRateLimits';
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
    memberId: seeded.member.userId,
    admin: t.withIdentity({ subject: seeded.admin.subject }),
    member: t.withIdentity({ subject: seeded.member.subject }),
  };
}

function summary(stage: z.infer<typeof playStageSchema>, players: Id<'users'>[]) {
  return {
    stage,
    seatCount: 6 as const,
    seats: players.map((userId, index) => ({ seat: `seat-${index + 1}`, userId, faction: null })),
    phase: null,
    lastActivityAt: Date.now(),
    result: null,
  };
}

/**
 * A real game the player entered, with the summary its Worker published: the player seated beside the creator.
 * `summary: false` leaves it unpublished, and a `spectator` entered it without a seat.
 */
async function seatedGame(
  ctx: MutationCtx,
  options: {
    player: Id<'users'>;
    creator: Id<'users'>;
    stage?: z.infer<typeof playStageSchema>;
    state?: 'ready' | 'expired';
    summary?: boolean;
    spectator?: Id<'users'>;
  }
) {
  const { player, creator, stage = 'play', state = 'ready' } = options;
  const ruleset = await ctx.db.query('rulesets').first();
  const players = player === creator ? [creator] : [creator, player];
  const gameId = await ctx.db.insert('play_games', {
    ruleset_id: ruleset!._id,
    minimum_players: 6,
    creator_id: creator,
    state,
    secret: 'a'.repeat(64),
    attempt_id: 'b'.repeat(64),
    provision_expires_at: 0,
    created_at: Date.now(),
    ...(options.summary === false ? {} : { directory: summary(stage, players), directory_stage: stage }),
  });
  for (const userId of options.spectator ? [...players, options.spectator] : players) {
    await ctx.db.insert('play_game_accounts', { game_id: gameId, user_id: userId });
  }
  return gameId;
}

async function ready(t: ReturnType<typeof setup>, gameId: Id<'play_games'>) {
  await t.run(async (ctx) => await ctx.db.patch(gameId, { state: 'ready', confirmed_at: Date.now() }));
}

describe('real games are created and entered by any signed-in player, Administrator or not', () => {
  test('any signed-in player reads the catalogue refusal for an unprepared game', async () => {
    const { t, admin, member, rulesets } = await world();
    const created = await admin.mutation(api.playGames.createGame, { rulesetId: rulesets.ready, minimumPlayers: 4 });
    if (!created.ok) {
      throw new Error('The fixture could not create its game.');
    }
    const gameId = created.gameId as Id<'play_games'>;
    const game = await t.run(async (ctx) => await ctx.db.get(gameId));
    if (!game) {
      throw new Error('The fixture game is missing.');
    }
    const reason = 'This ruleset is not ready: spice, Publish every member and back before requesting this asset.';
    await t.mutation(api.playProvisioning.failProvisioning, {
      gameId,
      secret: game.secret,
      attemptId: game.attempt_id,
      reason,
    });
    expect(await admin.query(api.playGames.getGame, { gameId })).toEqual({ status: 'unavailable', reason });
    expect(await member.query(api.playGames.getGame, { gameId })).toEqual({ status: 'unavailable', reason });
    expect(await t.query(api.playGames.getGame, { gameId })).toEqual({ status: 'sign_in_required' });
  });

  test('creatable rulesets read for any signed-in player with each deck objection, and nothing signed out', async () => {
    const { t, admin, member, rulesets } = await world();
    expect(await t.query(api.playGames.creatable, {})).toEqual({ access: 'unauthenticated' });
    expect(await member.query(api.playGames.creatable, {})).toEqual(await admin.query(api.playGames.creatable, {}));
    const listing = await member.query(api.playGames.creatable, {});
    expect(listing.access).toBe('allowed');
    if (listing.access !== 'allowed') {
      throw new Error('unreachable');
    }
    expect(listing.rulesets.map(({ id, objection }) => [id, objection])).toEqual([
      [rulesets.unlinked, 'No treachery deck is linked.'],
      [rulesets.ready, null],
      [rulesets.emptySpice, 'The spice deck is empty.'],
    ]);
  });

  test('creation records the ruleset, minimum and creator on a pending game any signed-in player can watch', async () => {
    const { t, admin, member, memberId, rulesets } = await world();
    const request = { rulesetId: rulesets.ready, minimumPlayers: 4 as const };
    expect(await t.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'not_authorized' });
    for (const rulesetId of [rulesets.emptySpice, rulesets.unlinked, rulesets.deleted]) {
      expect(await member.mutation(api.playGames.createGame, { ...request, rulesetId })).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    }
    const created = await member.mutation(api.playGames.createGame, request);
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error('unreachable');
    }
    const game = await t.run(async (ctx) => await ctx.db.get(created.gameId));
    expect(game).toMatchObject({
      state: 'pending',
      ruleset_id: rulesets.ready,
      minimum_players: 4,
      creator_id: memberId,
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
      game: { rulesetId: rulesets.ready, minimumPlayers: 4, creator: { userId: memberId } },
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
    await t.run(async (ctx) => await ctx.db.patch(created.gameId, { creator_id: memberId }));

    expect(await t.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({ status: 'sign_in_required' });
    expect(await member.query(api.playGames.getGame, { gameId: 'not-a-game' })).toEqual({ status: 'not_found' });
    expect(await member.query(api.playGames.getGame, { gameId: created.gameId })).toEqual({ status: 'preparing' });
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

  test('creation is budgeted per account', async () => {
    const { admin, member, rulesets } = await world();
    const request = { rulesetId: rulesets.ready, minimumPlayers: 4 as const };
    for (let index = 0; index < 3; index++) {
      expect(await member.mutation(api.playGames.createGame, request)).toMatchObject({ ok: true });
    }
    expect(await member.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'rate_limited' });
    expect(await admin.mutation(api.playGames.createGame, request)).toMatchObject({ ok: true });
  });

  test('a player seated in the most games one player may hold is refused a new one without spending the hourly budget', async () => {
    const { t, member, memberId, adminId, rulesets } = await world();
    const request = { rulesetId: rulesets.ready, minimumPlayers: 4 as const };
    await t.run(async (ctx) => {
      for (let index = 0; index < PLAY_SEAT_LIMIT - 1; index++) {
        await seatedGame(ctx, { player: memberId, creator: adminId });
      }
    });
    expect(await member.mutation(api.playGames.createGame, request)).toMatchObject({ ok: true });
    /* The game just created has no summary yet, and its creator's seat counts from creation. */
    expect(await member.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'seat_limit' });
    const budget = await t.run(
      async (ctx) => await playRateLimiter.check(ctx, 'playCreatePerAccount', { key: memberId, count: 2 })
    );
    expect(budget.ok).toBe(true);
  });

  test('finished, discarded and expired games hold no seat, and the game being entered is not counted', async () => {
    const { t, admin, member, memberId, adminId, rulesets } = await world();
    const request = { rulesetId: rulesets.ready, minimumPlayers: 4 as const };
    await t.run(async (ctx) => {
      for (let index = 0; index < PLAY_SEAT_LIMIT - 2; index++) {
        await seatedGame(ctx, { player: memberId, creator: adminId });
      }
      await seatedGame(ctx, { player: memberId, creator: adminId, stage: 'finished' });
      await seatedGame(ctx, { player: memberId, creator: adminId, stage: 'discarded' });
      await seatedGame(ctx, { player: memberId, creator: adminId, state: 'expired' });
      await seatedGame(ctx, { player: memberId, creator: memberId, state: 'expired', summary: false });
      /* A game the player only watched holds no seat either. */
      await seatedGame(ctx, { player: adminId, creator: adminId, spectator: memberId });
    });
    const created = await admin.mutation(api.playGames.createGame, request);
    if (!created.ok) {
      throw new Error('The fixture could not create its game.');
    }
    await ready(t, created.gameId);
    const redeem = async () => {
      const issued = await member.mutation(api.playAdmission.issueTicket, { gameId: created.gameId });
      if (!issued.ok) {
        throw new Error('Ticket issuance refused');
      }
      const game = (await t.run(async (ctx) => await ctx.db.get(created.gameId)))!;
      return await t.mutation(api.playAdmission.redeemTicket, {
        gameId: created.gameId,
        secret: game.secret,
        ticket: issued.ticket,
      });
    };
    expect(await redeem()).toMatchObject({ ok: true, seatLimitReached: false });

    /* With a 29th seat elsewhere and one in this game, creation is refused, but entering this game is not: its own seat is not counted, so leaving it there lets the player ask again. */
    await t.run(async (ctx) => {
      await seatedGame(ctx, { player: memberId, creator: adminId });
      await ctx.db.patch(created.gameId, { directory: summary('play', [adminId, memberId]), directory_stage: 'play' });
    });
    expect(await member.mutation(api.playGames.createGame, request)).toEqual({ ok: false, reason: 'seat_limit' });
    expect(await redeem()).toMatchObject({ ok: true, seatLimitReached: false });
    await t.run(async (ctx) => await seatedGame(ctx, { player: memberId, creator: adminId }));
    expect(await redeem()).toMatchObject({ ok: true, seatLimitReached: true });
  });

  test('admission to a real game ignores the Administrator flag at every step', async () => {
    const { t, admin, member, adminId, rulesets } = await world();
    const created = await admin.mutation(api.playGames.createGame, { rulesetId: rulesets.ready, minimumPlayers: 6 });
    if (!created.ok) {
      throw new Error('unreachable');
    }
    await ready(t, created.gameId);
    const game = (await t.run(async (ctx) => await ctx.db.get(created.gameId)))!;
    expect(await member.mutation(api.playAdmission.issueTicket, { gameId: created.gameId })).toMatchObject({
      ok: true,
    });
    const issued = await admin.mutation(api.playAdmission.issueTicket, { gameId: created.gameId });
    if (!issued.ok) {
      throw new Error('Ticket issuance refused');
    }
    /* Losing Administrator status between issuing and redeeming changes nothing. */
    await t.run(async (ctx) => await ctx.db.patch(adminId, { isAdmin: false }));
    const credentials = { gameId: created.gameId, secret: game.secret };
    const admission = await t.mutation(api.playAdmission.redeemTicket, { ...credentials, ticket: issued.ticket });
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
    await t.run(async (ctx) => await ctx.db.patch(adminId, { isAdmin: true }));
    expect(await watch()).toMatchObject({ ok: true, entries: [{ allowed: true }] });
  });

  test('provisioning and admission name a player from their profile within the display-name cap', async () => {
    const { t, admin, adminId, rulesets } = await world();
    const created = await admin.mutation(api.playGames.createGame, { rulesetId: rulesets.ready, minimumPlayers: 4 });
    if (!created.ok) {
      throw new Error('unreachable');
    }
    const game = (await t.run(async (ctx) => await ctx.db.get(created.gameId)))!;
    const credentials = { gameId: created.gameId, secret: game.secret };
    const creator = async () => {
      const validation = await t.mutation(api.playProvisioning.validateProvisioning, {
        ...credentials,
        attemptId: game.attempt_id,
      });
      return 'game' in validation ? validation.game.creator : null;
    };
    const admitted = async () => {
      const issued = await admin.mutation(api.playAdmission.issueTicket, { gameId: created.gameId });
      if (!issued.ok) {
        throw new Error('Ticket issuance refused');
      }
      return await t.mutation(api.playAdmission.redeemTicket, { ...credentials, ticket: issued.ticket });
    };
    const avatarUrl = 'https://dune.zone/avatar/administrator.webp';
    const capped = 'n'.repeat(PLAY_DISPLAY_NAME_MAX_LENGTH);

    expect(await creator()).toMatchObject({ displayName: 'Player', avatarUrl: null, profileSlug: null });
    const profileId = await t.run(
      async (ctx) =>
        await ctx.db.insert('profiles', {
          user_id: adminId,
          username: `${capped}overflow`,
          avatar_url: 'https://example.invalid/external.png',
          avatar: { url: avatarUrl, source_url: 'https://example.invalid/external.png', width: 256, height: 256 },
          account_state: 'active',
          slug: 'administrator',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
    );
    expect(await creator()).toMatchObject({ displayName: capped, avatarUrl, profileSlug: 'administrator' });
    await ready(t, created.gameId);
    expect(await admitted()).toMatchObject({ ok: true, displayName: capped, avatarUrl, profileSlug: 'administrator' });
    /* A slug too long to carry leaves the player unlinked rather than refusing their admission. */
    await t.run(async (ctx) => await ctx.db.patch(profileId, { slug: 's'.repeat(PLAY_PROFILE_SLUG_MAX_LENGTH + 1) }));
    expect(await admitted()).toMatchObject({ ok: true, displayName: capped, profileSlug: null });
    await t.run(async (ctx) => await ctx.db.delete(profileId));
    expect(await admitted()).toMatchObject({ ok: true, displayName: 'Player', avatarUrl: null, profileSlug: null });
  });

  test('the ready hosted fixture reads as not found and issues no ticket, Administrator or not', async () => {
    const { t, admin, member } = await world();
    /* The hosted fixture's stored row: its key and no ruleset. */
    const fixture = await t.run(async (ctx) => await insertPendingGame(ctx, { fixture_key: PLAY_FIXTURE_KEY }));
    await ready(t, fixture.gameId);
    for (const player of [admin, member]) {
      expect(await player.query(api.playGames.getGame, { gameId: fixture.gameId })).toEqual({ status: 'not_found' });
      expect(await player.mutation(api.playAdmission.issueTicket, { gameId: fixture.gameId })).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    }
  });
});
