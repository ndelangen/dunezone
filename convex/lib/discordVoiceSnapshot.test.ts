import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { discordVoiceSnapshot } from './discordVoiceSnapshot';
import { SnapshotSocket, snapshotDiscovery, snapshotGuild } from './discordVoiceSnapshot.test.fixture';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    if (!(array instanceof Uint32Array)) {
      throw new Error('Heartbeat jitter must use an unsigned 32-bit sample.');
    }
    array.fill(2 ** 31);
    return array;
  });
  SnapshotSocket.sockets = [];
  SnapshotSocket.onIdentify = undefined;
  vi.stubGlobal('WebSocket', SnapshotSocket);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const targets = [
  { guildId: '100', discordChannelId: '300' },
  { guildId: '100', discordChannelId: '301' },
];
const start = (input: unknown = snapshotDiscovery) =>
  discordVoiceSnapshot('test-token', input, targets, Date.now() + 25_000, () => {});
const socket = () => SnapshotSocket.sockets.at(-1)!;
const hello = () => socket().packet(10, { heartbeat_interval: 1000 });

test.each(['wss://gateway.discord.gg', 'wss://gateway.discord.gg/'])(
  'an available snapshot at %s distinguishes occupied and empty and closes immediately',
  async (url) => {
    const result = start({ ...snapshotDiscovery, url });
    hello();
    expect(socket().sent[0]).toMatchObject({ op: 2, d: { intents: 129 } });
    socket().packet(0, snapshotGuild([{ user_id: '900', channel_id: '300' }]), 'GUILD_CREATE');
    expect(await result).toEqual({ empty: ['301'], missing: [] });
    expect(socket().closed).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(SnapshotSocket.sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

test.each(['ready-only', 'unavailable', 'missing-states', 'malformed', 'closed', 'reconnect', 'invalid-session'])(
  '%s never becomes an empty observation or reconnects',
  async (failure) => {
    const result = start();
    hello();
    if (failure === 'ready-only') {
      socket().packet(0, { guilds: [{ id: '100' }] }, 'READY');
    } else if (failure === 'unavailable') {
      socket().packet(0, { id: '100', unavailable: true }, 'GUILD_CREATE');
    } else if (failure === 'missing-states') {
      socket().packet(0, { id: '100', channels: [] }, 'GUILD_CREATE');
    } else if (failure === 'malformed') {
      socket().event('message', 'not-json');
    } else if (failure === 'closed') {
      socket().event('close');
    } else {
      socket().packet(failure === 'reconnect' ? 7 : 9, null);
    }
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await result).toBeNull();
    expect(socket().closed).toBe(true);
    expect(SnapshotSocket.sockets).toHaveLength(1);
  }
);

test('a missing target channel is unknown even when its guild has no voice occupants', async () => {
  const result = start();
  hello();
  socket().packet(0, { ...snapshotGuild(), channels: [{ id: '301', type: 2 }] }, 'GUILD_CREATE');
  expect(await result).toEqual({ empty: ['301'], missing: ['300'] });
});

test('a partial multi-guild snapshot fails closed at the deadline', async () => {
  const result = discordVoiceSnapshot(
    'test-token',
    snapshotDiscovery,
    [...targets, { guildId: '101', discordChannelId: '400' }],
    Date.now() + 25_000,
    () => {}
  );
  hello();
  socket().packet(0, snapshotGuild(), 'GUILD_CREATE');
  await vi.advanceTimersByTimeAsync(25_000);
  expect(await result).toBeNull();
});

test('voice updates while collecting other guilds invalidate the earlier snapshot', async () => {
  const result = discordVoiceSnapshot(
    'test-token',
    snapshotDiscovery,
    [...targets, { guildId: '101', discordChannelId: '400' }],
    Date.now() + 25_000,
    () => {}
  );
  hello();
  socket().packet(0, snapshotGuild(), 'GUILD_CREATE');
  socket().packet(0, { guild_id: '100', user_id: '900', channel_id: '300' }, 'VOICE_STATE_UPDATE');
  socket().packet(0, { id: '101', channels: [{ id: '400', type: 2 }], voice_states: [] }, 'GUILD_CREATE');
  expect(await result).toBeNull();
});

test('server-requested heartbeats answer immediately even with an ACK pending', async () => {
  const result = start();
  hello();
  await vi.advanceTimersByTimeAsync(1000);
  socket().packet(1, null);
  expect(socket().sent.filter((packet) => packet.op === 1)).toHaveLength(2);
  socket().packet(11, null);
  socket().packet(0, snapshotGuild(), 'GUILD_CREATE');
  expect(await result).toEqual({ empty: ['300', '301'], missing: [] });
});

test('heartbeats retain the last sequence for null or absent updates and accept sequence zero', async () => {
  const result = start();
  hello();
  socket().event('message', JSON.stringify({ op: 0, t: 'READY', s: 6, d: {} }));
  socket().event('message', JSON.stringify({ op: 11, s: null, d: null }));
  socket().packet(1, null);
  expect(socket().sent.at(-1)).toEqual({ op: 1, d: 6 });
  socket().event('message', JSON.stringify({ op: 0, t: 'READY', s: 0, d: {} }));
  socket().packet(11, null);
  socket().packet(1, null);
  expect(socket().sent.at(-1)).toEqual({ op: 1, d: 0 });
  socket().packet(0, snapshotGuild(), 'GUILD_CREATE');
  expect(await result).toEqual({ empty: ['300', '301'], missing: [] });
});

test('a missing heartbeat ACK closes the one attempt', async () => {
  const result = start();
  hello();
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBeNull();
  expect(socket().closed).toBe(true);
});

test('a failed IDENTIFY send leaves no heartbeat timer behind', async () => {
  const result = start();
  vi.spyOn(socket(), 'send').mockImplementation(() => {
    throw new Error('The socket closed before IDENTIFY.');
  });
  hello();
  expect(await result).toBeNull();
  expect(socket().closed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  { ...snapshotDiscovery, url: 'wss://attacker.example' },
  { ...snapshotDiscovery, url: 'ws://gateway.discord.gg' },
  { ...snapshotDiscovery, url: 'wss://user:password@gateway.discord.gg' },
  { ...snapshotDiscovery, url: 'wss://gateway.discord.gg:444/' },
  { ...snapshotDiscovery, url: 'wss://gateway.discord.gg/other' },
  { ...snapshotDiscovery, url: 'wss://gateway.discord.gg/?' },
  { ...snapshotDiscovery, url: 'wss://gateway.discord.gg/#' },
  { ...snapshotDiscovery, session_start_limit: { remaining: 0, reset_after: 60_000 } },
  { ...snapshotDiscovery, shards: 2 },
])('invalid discovery or exhausted identify budget never opens a socket', async (data) => {
  expect(await start(data)).toBeNull();
  expect(SnapshotSocket.sockets).toEqual([]);
});
