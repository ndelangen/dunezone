/* @vitest-environment edge-runtime */

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import { DISCORD_PARKED, retryDiscordChannel } from './lib/discordRetry';
import { DISCORD_LEASE, DISCORD_RETRY } from './lib/playDiscord';
import { playPerson } from './play.test.fixture';
import { configureDiscord, voiceWorld } from './playDiscord.test.fixture';

type World = Awaited<ReturnType<typeof voiceWorld>>;
type ListedChannel = { id: string; type: number; name: string; parent_id?: string; guild_id?: string };
type CreateOutcome = { kind: 'ok' | 'lost' | '500'; visible: boolean };
type RequestRecord = { method: string; path: string; body: unknown };

beforeEach(() => {
  vi.useFakeTimers();
  configureDiscord();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type RemoteDiscord = {
  channels: ListedChannel[];
  outcomes: CreateOutcome[];
  calls: RequestRecord[];
  onList?: () => Promise<void>;
  onWrite?: (call: RequestRecord) => Promise<void>;
  listingFails: boolean;
  creates: number;
};

async function listRemoteChannels(remote: RemoteDiscord) {
  await remote.onList?.();
  return remote.listingFails ? Response.json({}, { status: 503 }) : Response.json(remote.channels);
}

function createRemoteChannel(remote: RemoteDiscord, body: unknown) {
  remote.creates += 1;
  const { name, parent_id } = body as { name: string; parent_id: string };
  const channel = { id: String(299 + remote.creates), type: 2, name, parent_id, guild_id: '100' };
  const outcome = remote.outcomes.shift() ?? { kind: 'ok', visible: true };
  if (outcome.visible) {
    remote.channels.push(channel);
  }
  if (outcome.kind === 'lost') {
    throw new Error('The create response was lost.');
  }
  return outcome.kind === '500' ? Response.json({}, { status: 500 }) : Response.json(channel);
}

async function writeRemoteChannel(remote: RemoteDiscord, call: RequestRecord) {
  await remote.onWrite?.(call);
  if (call.method === 'DELETE') {
    remote.channels = remote.channels.filter((channel) => `/channels/${channel.id}` !== call.path);
    return new Response(null, { status: 204 });
  }
  if (call.method === 'PATCH') {
    return Response.json({});
  }
  if (call.method === 'POST' && call.path.endsWith('/invites')) {
    return Response.json({ code: 'recovered-room' });
  }
  throw new Error(`Unexpected Discord request: ${call.method} ${call.path}`);
}

async function remoteResponse(remote: RemoteDiscord, call: RequestRecord) {
  if (call.method === 'GET' && call.path === '/guilds/100/channels') {
    return await listRemoteChannels(remote);
  }
  if (call.method === 'POST' && call.path === '/guilds/100/channels') {
    return createRemoteChannel(remote, call.body);
  }
  if (/^\/channels\/\d+(?:\/invites)?$/.test(call.path)) {
    return await writeRemoteChannel(remote, call);
  }
  throw new Error(`Unexpected Discord request: ${call.method} ${call.path}`);
}

/** The remote list survives a lost response, independently of the application's saved channel row. */
function remoteDiscord() {
  const remote: RemoteDiscord = {
    channels: [{ id: '200', type: 4, name: 'Games', guild_id: '100' }],
    outcomes: [],
    calls: [],
    listingFails: false,
    creates: 0,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      const path = (input instanceof Request ? input.url : String(input)).replace('https://discord.com/api/v10', '');
      const method = options?.method ?? 'GET';
      const body: unknown = typeof options?.body === 'string' ? JSON.parse(options.body) : null;
      const call = { method, path, body };
      remote.calls.push(call);
      return await remoteResponse(remote, call);
    })
  );
  return remote;
}

async function uncertainCreation(outcome: CreateOutcome = { kind: 'lost', visible: false }) {
  const remote = remoteDiscord();
  remote.outcomes.push(outcome);
  const world = await voiceWorld();
  await world.reconcile();
  const channel = (await world.channel())!;
  expect(channel).toMatchObject({
    state: 'creating',
    creation_marker: `dune-play-${world.gameId}`,
    creation_category_id: '200',
    creation_attempt: 1,
  });
  expect(remote.creates).toBe(1);
  expect(channel.next_attempt_at).toBeGreaterThanOrEqual(Date.now() + DISCORD_RETRY);
  return { world, remote };
}

async function retry(world: World) {
  vi.setSystemTime(Math.max(Date.now(), (await world.channel())!.next_attempt_at));
  await world.reconcile();
}

async function removeDuringRecovery(world: World, removal: 'ban' | 'discard') {
  if (removal === 'discard') {
    await world.publish(2, world.summary(undefined, { stage: 'discarded' }));
    return;
  }
  const moderator = await world.t.run(async (ctx) => await playPerson(ctx, 'Moderator', { isAdmin: true }));
  const { operationId } = await world.t
    .withIdentity({ subject: moderator.subject })
    .mutation(api.accountDeletion.adminBan, {
      sourceUserId: world.identity.userId,
      replacementUserId: null,
    });
  await world.t.mutation(internal.playDeletion.queueBanGames, { operationId });
}

test.each(['lost', '500'] as const)(
  'an ambiguous %s create adopts its exact visible marker before PATCH or invite',
  async (kind) => {
    const { world, remote } = await uncertainCreation({ kind, visible: true });
    const persistedBeforeWrites: string[] = [];
    remote.onWrite = async (call) => {
      expect(await world.channel()).toMatchObject({ channel_id: '300', state: 'pending' });
      persistedBeforeWrites.push(`${call.method} ${call.path}`);
    };
    await retry(world);
    expect(remote.creates).toBe(1);
    expect(persistedBeforeWrites).toEqual(['PATCH /channels/300', 'POST /channels/300/invites']);
    expect(await world.channel()).toMatchObject({
      state: 'ready',
      channel_id: '300',
      invite_url: 'https://discord.gg/recovered-room',
    });
  }
);

test('a complete negative listing parks creation instead of authorizing a replacement', async () => {
  const { world, remote } = await uncertainCreation();
  await retry(world);
  const calls = remote.calls.length;
  await world.reconcile();
  await world.t.mutation(internal.playDiscord.retryDue, {});
  expect(remote.creates).toBe(1);
  expect(remote.calls).toHaveLength(calls);
  expect(await world.channel()).toMatchObject({
    state: 'creating',
    creation_attempt: 1,
    next_attempt_at: DISCORD_PARKED,
    retry: { kind: 'bounded', operation: 'provision', needsAttention: true },
  });
});

test('an explicit retry can adopt a later visible marker without another POST', async () => {
  const { world, remote } = await uncertainCreation();
  await retry(world);
  remote.channels.push({ id: '700', type: 2, name: `dune-play-${world.gameId}`, parent_id: '200', guild_id: '100' });
  const parked = (await world.channel())!;
  await world.t.run(async (ctx) => retryDiscordChannel(ctx, (await ctx.db.get(parked._id))!));
  await world.reconcile();
  expect(remote.creates).toBe(1);
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '700' });
});

test.each(['duplicates', 'wrong type', 'wrong category', 'wrong guild', 'missing category', 'failed listing'] as const)(
  '%s never authorizes a replacement POST',
  async (condition) => {
    const { world, remote } = await uncertainCreation();
    const match = { id: '700', type: 2, name: `dune-play-${world.gameId}`, parent_id: '200', guild_id: '100' };
    if (condition === 'duplicates') {
      remote.channels.push(match, { ...match, id: '701' });
    }
    if (condition === 'wrong type') {
      remote.channels.push({ ...match, type: 0 });
    }
    if (condition === 'wrong category') {
      remote.channels.push({ ...match, parent_id: '201' });
    }
    if (condition === 'wrong guild') {
      remote.channels.push({ ...match, guild_id: '101' });
    }
    if (condition === 'missing category') {
      remote.channels = [];
    }
    if (condition === 'failed listing') {
      remote.listingFails = true;
    }
    await retry(world);
    expect(remote.creates).toBe(1);
    expect(remote.calls.filter((call) => call.method === 'PATCH' || call.path.endsWith('/invites'))).toEqual([]);
    expect(await world.channel()).toMatchObject({ state: 'creating', creation_attempt: 1 });
    expect((await world.channel())!.channel_id).toBeUndefined();
    if (condition !== 'failed listing') {
      expect(await world.channel()).toMatchObject({ next_attempt_at: DISCORD_PARKED, retry: { needsAttention: true } });
    } else {
      await retry(world);
      expect(await world.channel()).toMatchObject({
        next_attempt_at: DISCORD_PARKED,
        retry: { attempts: 3, needsAttention: true },
      });
    }
  }
);

test('deployment guild and category switches cannot move adoption out of its saved target', async () => {
  const { world, remote } = await uncertainCreation({ kind: 'lost', visible: true });
  vi.stubEnv('DISCORD_GUILD_ID', '101');
  vi.stubEnv('DISCORD_GAMES_CATEGORY_IDS', '900');
  await retry(world);
  expect(await world.channel()).toMatchObject({
    state: 'ready',
    guild_id: '100',
    creation_category_id: '200',
    channel_id: '300',
  });
  expect(
    remote.calls
      .filter((call) => call.path.startsWith('/guilds/'))
      .every((call) => call.path === '/guilds/100/channels')
  ).toBe(true);
  expect(
    remote.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/channels')).map((call) => call.body)
  ).toEqual([{ name: `dune-play-${world.gameId}`, type: 2, parent_id: '200' }]);
});

test.each(['ban', 'discard'] as const)('%s during a negative listing prevents replacement', async (removal) => {
  const { world, remote } = await uncertainCreation();
  remote.onList = async () => {
    remote.onList = undefined;
    await removeDuringRecovery(world, removal);
  };
  await retry(world);
  await world.reconcile();
  expect(remote.creates).toBe(1);
  expect(await world.channel()).toMatchObject({ state: 'creating', retry: { needsAttention: true } });
  expect(remote.calls.filter((call) => call.method === 'PATCH' || call.path.endsWith('/invites'))).toEqual([]);
});

test.each(['ban', 'discard'] as const)(
  '%s during a matching listing removes the adopted ID before inviting',
  async (removal) => {
    const { world, remote } = await uncertainCreation({ kind: 'lost', visible: true });
    remote.onList = async () => {
      remote.onList = undefined;
      await removeDuringRecovery(world, removal);
    };
    remote.onWrite = async (call) => {
      expect(call).toMatchObject({ method: 'DELETE', path: '/channels/300' });
      expect(await world.channel()).toMatchObject({ state: 'deleting', channel_id: '300' });
    };
    await retry(world);
    await world.reconcile();
    expect(remote.creates).toBe(1);
    expect(await world.channel()).toMatchObject({ state: 'deleted', channel_id: '300' });
    expect(remote.calls.filter((call) => call.method === 'PATCH' || call.path.endsWith('/invites'))).toEqual([]);
    expect(remote.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  }
);

test('live and superseded leases cannot claim or adopt a competing creation', async () => {
  const remote = remoteDiscord();
  const world = await voiceWorld();
  const row = (await world.channel())!;
  const claimed = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  const claim = { channelId: row._id, lease: claimed.lease! };
  expect(await world.t.mutation(internal.playDiscord.startCreation, { ...claim, categoryId: '200' })).toBe(true);
  await world.reconcile();
  expect(remote.calls).toEqual([]);
  vi.setSystemTime(Date.now() + DISCORD_LEASE + 1);
  expect(await world.t.mutation(internal.playDiscord.startCreation, { ...claim, categoryId: '200' })).toBe(false);
  const successor = (await world.t.mutation(internal.playDiscord.claim, { channelId: row._id }))!;
  expect(successor.lease).not.toBe(claim.lease);
  expect(await world.t.mutation(internal.playDiscord.created, { ...claim, discordChannelId: '700' })).toBe(false);
  expect(await world.channel()).toMatchObject({ state: 'creating', creation_attempt: 1, lease: successor.lease });
  expect(remote.calls).toEqual([]);
});

test('a finished game without a visible channel never creates a replacement', async () => {
  const { world, remote } = await uncertainCreation();
  await world.publish(2, world.summary(undefined, { stage: 'finished' }));
  await retry(world);
  expect(remote.creates).toBe(1);
  expect(await world.channel()).toMatchObject({ state: 'creating', retry: { needsAttention: true } });
});

test('an exhausted provisioning budget preserves its real deadline through explicit retry', async () => {
  const remote = remoteDiscord();
  const world = await voiceWorld();
  const row = (await world.channel())!;
  const until = Date.now() + 60_000;
  await world.t.run((ctx) =>
    ctx.db.patch(row._id, {
      retry: {
        kind: 'bounded',
        operation: 'provision',
        attempts: 3,
        needsAttention: true,
        revision: row.work_revision ?? 0,
        until,
      },
    })
  );
  expect(await world.t.mutation(internal.playDiscord.claim, { channelId: row._id })).toBeNull();
  expect(await world.channel()).toMatchObject({ retry: { kind: 'bounded', needsAttention: true, until } });
  await world.t.run(async (ctx) => retryDiscordChannel(ctx, (await ctx.db.get(row._id))!));
  expect((await world.channel())!.next_attempt_at).toBe(until);
  await world.reconcile();
  expect(remote.calls).toEqual([]);
  vi.setSystemTime(until);
  await world.reconcile();
  expect(remote.creates).toBe(1);
  expect(await world.channel()).toMatchObject({ state: 'ready', channel_id: '300' });
});
