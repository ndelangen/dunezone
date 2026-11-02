/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import type { PlayDirectorySummary } from '../src/shared/play/directory';
import { api } from './_generated/api';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

async function world() {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const admin = await playPerson(ctx, 'Administrator', { isAdmin: true });
    const member = await playPerson(ctx, 'Member');
    const gone = await playPerson(ctx, 'Departed', { accountState: 'deleted' });
    return { admin, member, gone, rulesetId: await playRuleset(ctx, admin.userId) };
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
    seatCount: 4,
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

describe('the directory keeps the newest published summary and lists it to every signed-in player', () => {
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
          name: game.name,
          slug: game.slug,
          rulesetName: 'Classic',
          stage: 'drafting',
          seatsFilled: 2,
          seatCount: 4,
          viewerSeated: true,
          players: [
            { displayName: 'Administrator', avatarUrl: null, viewer: true, faction: null },
            { displayName: 'Member', avatarUrl: null, viewer: false, faction: null },
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
    /* A player without the Administrator flag reads the same listing. */
    expect(await member.query(api.playDirectory.listGames, {})).toMatchObject({
      status: 'ready',
      ongoing: [{ seatsFilled: 1, players: [{ displayName: 'Administrator' }] }],
    });
    const listed = await admin.query(api.playDirectory.listGames, {});
    expect(listed).toMatchObject({
      ongoing: [{ seatsFilled: 1, players: [{ displayName: 'Administrator' }] }],
    });
    const result = {
      kind: 'faction' as const,
      factions: [{ id: 'atreides', name: 'Atreides' }],
      declaredBy: ids.admin,
      declaredAt: 5000,
    };
    await publish(2, summary([ids.admin], { stage: 'finished', result, lastActivityAt: 5000 }));
    /* The lobby reads faction names and no user id from a result, even when the winner's seat is empty. */
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      ongoing: [],
      past: [{ gameId: game._id, stage: 'finished', result: { kind: 'faction', factions: ['Atreides'] } }],
    });
    /* Continue playing after a delayed finish: the newer sequence wins whichever arrives last. */
    await publish(3, summary([ids.admin], { stage: 'play', phase: 12, lastActivityAt: 6000 }));
    expect(await publish(2, summary([ids.admin], { stage: 'finished', result }))).toEqual({ ok: true, sequence: 3 });
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      past: [],
      ongoing: [{ stage: 'play', phase: 12 }],
    });
  });

  test('a stage holding more games than the lobby shows keeps its newest ones', async () => {
    const { t, admin, ids, game, publish, summary } = await world();
    await publish(1, summary([ids.admin], { stage: 'finished', lastActivityAt: 1 }));
    /* A hundred older finished games, then the newest one, which must still be listed. */
    const newest = await t.run(async (ctx) => {
      const { _id, _creationTime, ...row } = (await ctx.db.get(game._id))!;
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert('play_games', { ...row, slug: `older-${index}` });
      }
      return await ctx.db.insert('play_games', { ...row, slug: 'newest' });
    });
    const lobby = await admin.query(api.playDirectory.listGames, {});
    if (lobby.status !== 'ready') {
      throw new Error('Expected a lobby');
    }
    expect(lobby.past).toHaveLength(100);
    expect(lobby.past.map((entry) => entry.gameId)).toContain(newest);
    expect(lobby.past.map((entry) => entry.gameId)).not.toContain(game._id);
  });

  test('a seated faction uses its linked preset instead of its saved fallback background', async () => {
    const { t, admin, ids, publish, summary } = await world();
    const preset: typeof assetPublishingFaction.background = {
      ...assetPublishingFaction.background,
      colors: ['#112233', '#445566'],
    };
    const factionId = await t.run(async (ctx) => {
      await ctx.db.insert('background_presets', {
        key: 'lobby-test',
        name: 'Lobby test',
        value: preset,
        revision: 1,
        updated_at: 1,
      });
      return await ctx.db.insert('factions', {
        owner_id: ids.admin,
        slug: 'atreides',
        data: {
          ...assetPublishingFaction,
          background: { ...assetPublishingFaction.background, source: { kind: 'preset', key: 'lobby-test' } },
        },
        group_id: null,
        is_deleted: false,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      });
    });
    const seated = summary([ids.admin]);
    seated.seats[0]!.faction = { id: factionId, name: 'Atreides', color: '#2f7d32' };
    await publish(1, seated);

    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      ongoing: [{ players: [{ faction: { token: { background: preset } } }] }],
    });
  });

  test('a seated faction carries its catalogue token, and a faction the catalogue no longer holds carries none', async () => {
    const { t, admin, ids, publish, summary } = await world();
    const factionId = await t.run(async (ctx) =>
      ctx.db.insert('factions', {
        owner_id: ids.admin,
        slug: 'atreides',
        data: {
          ...assetPublishingFaction,
          name: 'Atreides',
          background: { ...assetPublishingFaction.background, source: { kind: 'custom' } },
        },
        group_id: null,
        is_deleted: false,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      })
    );
    const seated = summary([ids.admin, ids.member]);
    seated.seats[0]!.faction = { id: factionId, name: 'Atreides', color: '#2f7d32' };
    seated.seats[1]!.faction = { id: 'retired-faction', name: 'Retired', color: '#444444' };
    await publish(1, seated);
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      ongoing: [
        {
          players: [
            {
              faction: {
                name: 'Atreides',
                color: '#2f7d32',
                token: { logo: assetPublishingFaction.logo, background: assetPublishingFaction.background },
                won: false,
              },
            },
            { faction: { name: 'Retired', token: null, won: false } },
          ],
        },
      ],
    });
    /* A winner is matched by faction id, so a namesake at the same table is not crowned. */
    const finished = summary([ids.admin, ids.member], {
      stage: 'finished',
      result: {
        kind: 'faction',
        factions: [{ id: factionId, name: 'Atreides' }],
        declaredBy: ids.admin,
        declaredAt: 2,
      },
    });
    finished.seats[0]!.faction = { id: factionId, name: 'Atreides', color: '#2f7d32' };
    finished.seats[1]!.faction = { id: 'namesake', name: 'Atreides', color: '#2f7d32' };
    await publish(2, finished);
    expect(await admin.query(api.playDirectory.listGames, {})).toMatchObject({
      past: [{ players: [{ faction: { won: true } }, { faction: { won: false } }] }],
    });
  });
});
