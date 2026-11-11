/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { playPerson, playRuleset, playTest } from './play.test.fixture';
import { configureDiscord } from './playDiscord.test.fixture';

beforeEach(configureDiscord);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = playTest();
  const people = await t.run(async (ctx) => {
    const admin = await playPerson(ctx, 'Admin');
    const player = await playPerson(ctx, 'Player');
    await ctx.db.patch(admin.userId, { isAdmin: true });
    return { admin, player };
  });
  return {
    t,
    admin: t.withIdentity({ subject: people.admin.subject }),
    player: t.withIdentity({ subject: people.player.subject }),
    people,
  };
}

test('only admins can inspect and change deployment settings', async () => {
  const { t, admin, player } = await setup();
  const args = { paginationOpts: { numItems: 2, cursor: null } };
  await expect(t.query(api.playDiscordAdmin.dashboard, args)).rejects.toThrow();
  await expect(player.query(api.playDiscordAdmin.dashboard, args)).rejects.toThrow();
  await expect(player.mutation(api.playDiscordAdmin.setEnabled, { enabled: false })).rejects.toThrow();
  await expect(player.action(api.playDiscordAdmin.refreshOrphans, {})).rejects.toThrow();
  expect(await admin.query(api.playDiscordAdmin.dashboard, args)).toMatchObject({ configured: true, enabled: true });
  await admin.mutation(api.playDiscordAdmin.setEnabled, { enabled: false });
  expect(await admin.query(api.playDiscordAdmin.dashboard, args)).toMatchObject({ configured: true, enabled: false });
  vi.stubEnv('DISCORD_BOT_TOKEN', '');
  await admin.mutation(api.playDiscordAdmin.setEnabled, { enabled: true });
  expect(await admin.query(api.playDiscordAdmin.dashboard, args)).toMatchObject({ configured: false, enabled: false });
});

test('inventory uses bounded pages and does not expose game credentials', async () => {
  const { t, admin } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++) {
      const game = await ctx.db.insert('play_games', {
        name: `Game ${i}`,
        slug: `game-${i}`,
        state: 'ready',
        secret: 'secret',
        attempt_id: 'attempt',
        created_at: i,
        provision_expires_at: 0,
      });
      await ctx.db.insert('play_game_discord_channels', {
        game_id: game,
        guild_id: '100',
        category_ids: ['200'],
        channel_id: `${300 + i}`,
        state: 'ready',
        created_at: i,
        cleanup_at: 100,
        next_attempt_at: 100,
      });
    }
  });
  const first = await admin.query(api.playDiscordAdmin.dashboard, { paginationOpts: { numItems: 2, cursor: null } });
  expect(first.channels.page).toHaveLength(2);
  expect(JSON.stringify(first)).not.toContain('secret');
  const second = await admin.query(api.playDiscordAdmin.dashboard, {
    paginationOpts: { numItems: 2, cursor: first.channels.continueCursor },
  });
  expect(second.channels.page).toHaveLength(1);
  expect(second.channels.isDone).toBe(true);
});

test('orphan removal rechecks the guild, category, type and tracking', async () => {
  const { t, admin, player } = await setup();
  const id = '700000000000000000';
  let candidate = { id, name: 'room', type: 2, parent_id: '200', guild_id: '100' };
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push(`${init?.method ?? 'GET'} ${url}`);
      return Response.json(url.endsWith('/guilds/100/channels') ? [candidate] : candidate);
    })
  );
  expect(await admin.action(api.playDiscordAdmin.refreshOrphans, {})).toEqual([
    { id, name: 'room', parent_id: '200', guild_id: '100' },
  ]);
  await expect(player.action(api.playDiscordAdmin.deleteOrphan, { channelId: id })).rejects.toThrow();
  candidate = { ...candidate, parent_id: '2010' };
  await expect(admin.action(api.playDiscordAdmin.deleteOrphan, { channelId: id })).rejects.toThrow();
  candidate = { ...candidate, parent_id: '200' };
  await t.run(async (ctx) => {
    const game = await ctx.db.insert('play_games', {
      name: 'Game',
      slug: 'game',
      state: 'ready',
      secret: 'secret',
      attempt_id: 'attempt',
      created_at: 0,
      provision_expires_at: 0,
    });
    await ctx.db.insert('play_game_discord_channels', {
      game_id: game,
      guild_id: '100',
      category_ids: ['200'],
      channel_id: id,
      state: 'deleted',
      created_at: 0,
      cleanup_at: 0,
      next_attempt_at: 0,
    });
  });
  expect(await admin.action(api.playDiscordAdmin.refreshOrphans, {})).toEqual([]);
  await expect(admin.action(api.playDiscordAdmin.deleteOrphan, { channelId: id })).rejects.toThrow();
  expect(requests.some((request) => request.startsWith('DELETE'))).toBe(false);
});

test('paused integration refuses manual channel deletion', async () => {
  const { t, admin } = await setup();
  const channelId = await t.run(async (ctx) => {
    const game = await ctx.db.insert('play_games', {
      name: 'Game',
      slug: 'paused-game',
      state: 'ready',
      secret: 'secret',
      attempt_id: 'attempt',
      created_at: 0,
      provision_expires_at: 0,
    });
    return await ctx.db.insert('play_game_discord_channels', {
      game_id: game,
      guild_id: '100',
      category_ids: ['200'],
      channel_id: '700000000000000000',
      state: 'ready',
      created_at: 0,
      cleanup_at: 0,
      next_attempt_at: 0,
    });
  });
  await admin.mutation(api.playDiscordAdmin.setEnabled, { enabled: false });
  await expect(admin.mutation(api.playDiscordAdmin.requestDelete, { channelId })).rejects.toThrow('Enable Discord');
  await expect(admin.action(api.playDiscordAdmin.deleteOrphan, { channelId: '700000000000000001' })).rejects.toThrow(
    'Enable Discord'
  );
  expect(await t.run(async (ctx) => (await ctx.db.get(channelId))?.state)).toBe('ready');
});

test('inventory reports cleanup deadlines', async () => {
  const { t, admin } = await setup();
  await t.run(async (ctx) => {
    const game = await ctx.db.insert('play_games', {
      name: 'Game',
      slug: 'game-delivery',
      state: 'ready',
      secret: 'secret',
      attempt_id: 'attempt',
      created_at: 0,
      provision_expires_at: 0,
    });
    await ctx.db.insert('play_game_discord_channels', {
      game_id: game,
      guild_id: '100',
      category_ids: ['200'],
      state: 'creating',
      created_at: 1,
      cleanup_at: 42,
      next_attempt_at: 0,
    });
  });
  const page = await admin.query(api.playDiscordAdmin.dashboard, { paginationOpts: { numItems: 5, cursor: null } });
  expect(page.channels.page[0]).toMatchObject({ state: 'creating', cleanup_at: 42 });
});

test('inventory reports an empty-voice wait only for hourly-eligible channels', async () => {
  const { t, admin, people } = await setup();
  const { gameId, channelId } = await t.run(async (ctx) => {
    const rulesetId = await playRuleset(ctx, people.player.userId);
    const gameId = await ctx.db.insert('play_games', {
      name: 'Finished game',
      slug: 'finished-game',
      state: 'ready',
      ruleset_id: rulesetId,
      discord_voice: true,
      secret: 'secret',
      attempt_id: 'attempt',
      created_at: 0,
      provision_expires_at: 0,
      directory: { stage: 'finished', seatCount: 6, seats: [], phase: null, lastActivityAt: 0, result: null },
    });
    const channelId = await ctx.db.insert('play_game_discord_channels', {
      game_id: gameId,
      guild_id: '100',
      category_ids: ['200'],
      channel_id: '300',
      state: 'ready',
      renamed_ended: true,
      created_at: 0,
      cleanup_at: 0,
      next_attempt_at: 0,
    });
    return { gameId, channelId };
  });
  const waiting = async () => {
    const result = await admin.query(api.playDiscordAdmin.dashboard, {
      paginationOpts: { numItems: 5, cursor: null },
    });
    return result.channels.page.find((row) => row._id === channelId)!.waiting_for_empty;
  };
  expect(await waiting()).toBe(true);
  const channelCases: Partial<Doc<'play_game_discord_channels'>>[] = [
    { state: 'pending' },
    { state: 'creating' },
    { state: 'deleting' },
    { state: 'deleted' },
    { channel_id: undefined },
    { renamed_ended: undefined },
    { renamed_ended: false },
    { deletion_requested_at: 0 },
  ];
  for (const fields of channelCases) {
    const previous = await t.run(async (ctx) => {
      const { _id: _ignoredId, _creationTime: _ignoredTime, ...previous } = (await ctx.db.get(channelId))!;
      await ctx.db.patch(channelId, fields);
      return previous;
    });
    expect(await waiting(), JSON.stringify(fields)).toBe(false);
    await t.run((ctx) => ctx.db.replace(channelId, previous));
  }
  const gameCases: Partial<Doc<'play_games'>>[] = [
    { state: 'expired' },
    { discord_voice: false },
    { ruleset_id: undefined },
    { fixture_key: 'fixture' },
    { directory: { stage: 'play', seatCount: 6, seats: [], phase: null, lastActivityAt: 0, result: null } },
  ];
  for (const fields of gameCases) {
    const previous = await t.run(async (ctx) => {
      const { _id: _ignoredId, _creationTime: _ignoredTime, ...previous } = (await ctx.db.get(gameId))!;
      await ctx.db.patch(gameId, fields);
      return previous;
    });
    expect(await waiting(), JSON.stringify(fields)).toBe(false);
    await t.run((ctx) => ctx.db.replace(gameId, previous));
  }
  expect(await waiting()).toBe(true);
});
