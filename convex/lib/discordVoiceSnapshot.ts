import { z } from 'zod';

const snowflake = z.string().regex(/^\d+$/);
const discoverySchema = z.object({
  url: z.string().max(2000),
  shards: z.literal(1),
  session_start_limit: z.object({
    remaining: z.number().int().positive(),
    reset_after: z.number().finite().nonnegative(),
  }),
});
const guildSchema = z.object({
  id: snowflake,
  unavailable: z.literal(false).optional(),
  channels: z.array(z.object({ id: snowflake, type: z.number().int() })).max(5000),
  voice_states: z.array(z.object({ channel_id: snowflake.nullable() })).max(100_000),
});
const updateSchema = z.object({ guild_id: snowflake });
const helloSchema = z.object({ heartbeat_interval: z.number().finite().min(1000).max(120_000) });
const packetSchema = z.object({
  op: z.number().int(),
  t: z.string().nullable().optional(),
  s: z.number().int().nonnegative().nullable().optional(),
  d: z.unknown(),
});
const MAX_PACKET_BYTES = 4 * 1024 * 1024;
const MAX_PACKETS = 10_000;

export type VoiceSnapshotFailure =
  | 'discovery'
  | 'deadline'
  | 'transport'
  | 'heartbeat'
  | 'protocol'
  | 'snapshot'
  | 'changed';

export type VoiceSnapshot = { empty: string[]; missing: string[] };

export type VoiceTarget = { guildId: string; discordChannelId: string };

type GuildState = { channels: Set<string>; occupied: Set<string> };

/** The normalized origin is the only allowed discovery destination, with or without a trailing slash. */
function gatewayUrl(discovery: unknown): URL | null {
  const parsed = discoverySchema.safeParse(discovery);
  if (!parsed.success) {
    return null;
  }
  try {
    const url = new URL(parsed.data.url);
    if (url.href !== 'wss://gateway.discord.gg/') {
      return null;
    }
    url.search = '?v=10&encoding=json';
    return url;
  } catch {
    return null;
  }
}

function decodePacket(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > MAX_PACKET_BYTES) {
    return null;
  }
  try {
    const packet = packetSchema.safeParse(JSON.parse(raw));
    return packet.success ? packet.data : null;
  } catch {
    return null;
  }
}

/** Called only once every target guild has supplied a complete available snapshot. */
function classifyTargets(targets: VoiceTarget[], states: Map<string, GuildState>): VoiceSnapshot {
  const result: VoiceSnapshot = { empty: [], missing: [] };
  for (const target of targets) {
    const state = states.get(target.guildId)!;
    if (!state.channels.has(target.discordChannelId)) {
      result.missing.push(target.discordChannelId);
    } else if (!state.occupied.has(target.discordChannelId)) {
      result.empty.push(target.discordChannelId);
    }
  }
  return result;
}

/** One fresh identify and a complete available guild snapshot. Failure always means unknown, never empty. */
export function discordVoiceSnapshot(
  token: string,
  discovery: unknown,
  targets: VoiceTarget[],
  deadline: number,
  onUnknown: (reason: VoiceSnapshotFailure) => void
): Promise<VoiceSnapshot | null> {
  const gateway = gatewayUrl(discovery);
  if (!gateway) {
    onUnknown('discovery');
    return Promise.resolve(null);
  }
  if (deadline <= Date.now() || targets.length === 0) {
    onUnknown('deadline');
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let socket: WebSocket;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let awaitingAck = false;
    let identified = false;
    let sequence: number | null = null;
    let packets = 0;
    let settled = false;
    const guilds = new Set(targets.map((target) => target.guildId));
    const states = new Map<string, GuildState>();
    const finish = (result: VoiceSnapshot | null, reason: VoiceSnapshotFailure = 'protocol') => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(heartbeat);
      try {
        socket?.close(1000, 'Snapshot complete');
      } catch {
        /* A failed handshake can already have closed the socket. */
      }
      if (result === null) {
        onUnknown(reason);
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish(null, 'deadline'), deadline - Date.now());
    const send = (op: number, d: unknown) => {
      try {
        socket.send(JSON.stringify({ op, d }));
        return true;
      } catch {
        finish(null, 'transport');
        return false;
      }
    };
    const pulse = () => {
      awaitingAck = true;
      send(1, sequence);
    };
    const scheduleHeartbeat = (interval: number, delay = interval) => {
      heartbeat = setTimeout(() => {
        if (awaitingAck) {
          finish(null, 'heartbeat');
          return;
        }
        pulse();
        if (!settled) {
          scheduleHeartbeat(interval);
        }
      }, delay);
    };
    const receiveHello = (data: unknown) => {
      const hello = helloSchema.safeParse(data);
      if (identified || !hello.success) {
        finish(null);
        return;
      }
      identified = true;
      if (send(2, { token, intents: 129, properties: { os: 'linux', browser: 'dunezone', device: 'dunezone' } })) {
        const [jitter] = crypto.getRandomValues(new Uint32Array(1));
        scheduleHeartbeat(hello.data.heartbeat_interval, (jitter / 2 ** 32) * hello.data.heartbeat_interval);
      }
    };
    const receiveGuild = (data: unknown) => {
      const guild = guildSchema.safeParse(data);
      if (!guild.success) {
        finish(null, 'snapshot');
        return;
      }
      if (!guilds.has(guild.data.id)) {
        return;
      }
      states.set(guild.data.id, {
        channels: new Set(guild.data.channels.filter((channel) => channel.type === 2).map((channel) => channel.id)),
        occupied: new Set(
          guild.data.voice_states.flatMap((state) => (state.channel_id === null ? [] : [state.channel_id]))
        ),
      });
      if (states.size === guilds.size) {
        finish(classifyTargets(targets, states));
      }
    };
    const receiveDispatch = (name: string | null | undefined, data: unknown) => {
      switch (name) {
        case 'GUILD_CREATE':
          receiveGuild(data);
          return;
        case 'VOICE_STATE_UPDATE': {
          const update = updateSchema.safeParse(data);
          if (!update.success) {
            finish(null);
            return;
          }
          /* An earlier guild snapshot may already be stale while another guild is still arriving. */
          if (states.has(update.data.guild_id)) {
            finish(null, 'changed');
          }
          return;
        }
        case 'GUILD_DELETE':
          finish(null);
      }
    };
    const receivePacket = ({ op, d, t, s }: z.infer<typeof packetSchema>) => {
      if (s !== undefined && s !== null) {
        sequence = s;
      }
      switch (op) {
        case 10:
          receiveHello(d);
          return;
        case 11:
          awaitingAck = false;
          return;
        case 1:
          pulse();
          return;
        case 7:
        case 9:
          finish(null);
          return;
        case 0:
          receiveDispatch(t, d);
      }
    };
    try {
      socket = new WebSocket(gateway.href);
      socket.addEventListener('error', () => finish(null, 'transport'));
      socket.addEventListener('close', () => finish(null, 'transport'));
      socket.addEventListener('message', (event) => {
        if (settled) {
          return;
        }
        const packet = ++packets > MAX_PACKETS ? null : decodePacket(event.data);
        if (!packet) {
          finish(null);
          return;
        }
        receivePacket(packet);
      });
    } catch {
      finish(null, 'transport');
    }
  });
}
