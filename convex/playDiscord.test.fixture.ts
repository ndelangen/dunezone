import { vi } from 'vite-plus/test';

import type { PlayDirectorySummary } from '../src/shared/play/directory';
import { api, internal } from './_generated/api';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

export function configureDiscord() {
  vi.stubEnv('DISCORD_BOT_TOKEN', 'test-token');
  vi.stubEnv('DISCORD_GUILD_ID', '100');
  vi.stubEnv('DISCORD_GAMES_CATEGORY_IDS', '200,201');
}

export function discordStub() {
  let member = true;
  let pregrant = true;
  const calls: { method: string; path: string; body: unknown; headers: HeadersInit | undefined }[] = [];
  const granted = new Set<string>();
  const fetch = vi.fn(async (input: string | URL | Request, options?: RequestInit): Promise<Response> => {
    const path = (input instanceof Request ? input.url : String(input)).replace('https://discord.com/api/v10', '');
    const method = options?.method ?? 'GET';
    const body: unknown = typeof options?.body === 'string' ? JSON.parse(options.body) : null;
    calls.push({ method, path, body, headers: options?.headers });
    if (path === '/users/@me') {
      return Response.json({ id: '999' });
    }
    if (path === '/guilds/100/channels' && method === 'GET') {
      return Response.json([
        { id: '200', type: 4 },
        { id: '201', type: 4 },
      ]);
    }
    if (path === '/guilds/100/channels' && method === 'POST') {
      return Response.json({ id: '300', type: 2, parent_id: '200' });
    }
    if (path.includes('/members/')) {
      return member ? Response.json({ user: { id: '400' } }) : Response.json({ code: 10_007 }, { status: 404 });
    }
    if (path.includes('/permissions/')) {
      if (method === 'PUT') {
        if (!member && !pregrant) {
          return Response.json({ code: 10_007 }, { status: 404 });
        }
        granted.add(path);
      } else {
        granted.delete(path);
      }
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/invites')) {
      return Response.json({ code: 'one-use' });
    }
    if (path === '/channels/300' && method === 'DELETE') {
      return Response.json({ id: '300' });
    }
    throw new Error(`Unexpected Discord request: ${method} ${path}`);
  });
  vi.stubGlobal('fetch', fetch);
  return {
    fetch,
    calls,
    granted,
    member: (value: boolean) => {
      member = value;
    },
    pregrant: (value: boolean) => {
      pregrant = value;
    },
  };
}

export async function voiceWorld({ connected = true, fixture = false } = {}) {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const player = await playPerson(ctx, 'Player');
    const spectator = await playPerson(ctx, 'Spectator');
    const rulesetId = await playRuleset(ctx, player.userId);
    const authId = connected
      ? await ctx.db.insert('authAccounts', { userId: player.userId, provider: 'discord', providerAccountId: '400' })
      : null;
    await ctx.db.insert('authAccounts', {
      userId: player.userId,
      provider: 'google',
      providerAccountId: 'google-player',
    });
    const gameId = await ctx.db.insert('play_games', {
      name: 'Quiet Sietch',
      slug: 'quiet-sietch',
      state: 'pending',
      ruleset_id: rulesetId,
      minimum_players: 4,
      creator_id: player.userId,
      secret: 'a'.repeat(64),
      attempt_id: 'b'.repeat(64),
      created_at: Date.now(),
      provision_expires_at: Date.now() + 60_000,
      ...(fixture ? { fixture_key: 'fixture' } : {}),
    });
    return { player, spectator, gameId, authId };
  });
  const credentials = { gameId: seeded.gameId, secret: 'a'.repeat(64), attemptId: 'b'.repeat(64) };
  await t.mutation(api.playProvisioning.confirmProvisioning, credentials);
  const summary = (
    seats = [seeded.player.userId],
    extra: Partial<PlayDirectorySummary> = {}
  ): PlayDirectorySummary => ({
    stage: 'play',
    seatCount: 4,
    seats: seats.map((userId, index) => ({ seat: `seat-${index + 1}`, userId, faction: null })),
    phase: 0,
    result: null,
    lastActivityAt: Date.now(),
    ...extra,
  });
  const publish = (sequence: number, value: PlayDirectorySummary) =>
    t.mutation(api.playDirectory.publishSummary, {
      gameId: seeded.gameId,
      secret: credentials.secret,
      sequence,
      summary: value,
    });
  await publish(1, summary());
  const channel = async () =>
    await t.run(
      async (ctx) =>
        await ctx.db
          .query('play_game_discord_channels')
          .withIndex('by_game_id', (q) => q.eq('game_id', seeded.gameId))
          .unique()
    );
  const reconcile = async () => {
    const row = await channel();
    if (row) {
      await t.action(internal.playDiscordActions.reconcile, { channelId: row._id });
    }
  };
  const player = t.withIdentity({ subject: seeded.player.subject });
  const grants = () => t.run(async (ctx) => await ctx.db.query('play_game_discord_grants').take(100));
  const menu = () => player.query(api.playGameDirectory.getGameByAddress, { address: 'quiet-sietch' });
  return {
    t,
    ...seeded,
    player,
    identity: seeded.player,
    credentials,
    summary,
    publish,
    channel,
    reconcile,
    grants,
    menu,
    join: () => player.mutation(api.playDiscord.join, { gameId: seeded.gameId }),
  };
}
