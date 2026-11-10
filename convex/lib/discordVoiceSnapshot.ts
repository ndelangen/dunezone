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

/** One fresh identify and a complete available guild snapshot. Failure always means unknown, never empty. */
export function discordVoiceSnapshot(
  token: string,
  discovery: unknown,
  targets: VoiceTarget[],
  deadline: number,
  onUnknown: (reason: VoiceSnapshotFailure) => void
): Promise<VoiceSnapshot | null> {
  const parsed = discoverySchema.safeParse(discovery);
  let gateway: URL | undefined;
  if (parsed.success) {
    try {
      const url = new URL(parsed.data.url);
      if (
        url.protocol === 'wss:' &&
        url.hostname === 'gateway.discord.gg' &&
        url.port === '' &&
        url.username === '' &&
        url.password === '' &&
        url.pathname === '/' &&
        url.search === '' &&
        url.hash === ''
      ) {
        url.search = '?v=10&encoding=json';
        gateway = url;
      }
    } catch {
      /* Invalid discovery is never used as a network destination. */
    }
  }
  if (!gateway || deadline <= Date.now() || targets.length === 0) {
    onUnknown(gateway ? 'deadline' : 'discovery');
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
    const states = new Map<string, { channels: Set<string>; occupied: Set<string> }>();
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
    try {
      socket = new WebSocket(gateway.href);
      socket.addEventListener('error', () => finish(null, 'transport'));
      socket.addEventListener('close', () => finish(null, 'transport'));
      socket.addEventListener('message', (event) => {
        if (settled) {
          return;
        }
        if (++packets > MAX_PACKETS || typeof event.data !== 'string' || event.data.length > MAX_PACKET_BYTES) {
          finish(null);
          return;
        }
        let value: unknown;
        try {
          value = JSON.parse(event.data);
        } catch {
          finish(null);
          return;
        }
        const packet = packetSchema.safeParse(value);
        if (!packet.success) {
          finish(null);
          return;
        }
        const { op, d, t, s } = packet.data;
        if (s !== undefined && s !== null) {
          sequence = s;
        }
        if (op === 10) {
          const hello = z.object({ heartbeat_interval: z.number().finite().min(1000).max(120_000) }).safeParse(d);
          if (identified || !hello.success) {
            finish(null);
            return;
          }
          identified = true;
          if (send(2, { token, intents: 129, properties: { os: 'linux', browser: 'dunezone', device: 'dunezone' } })) {
            scheduleHeartbeat(hello.data.heartbeat_interval, Math.random() * hello.data.heartbeat_interval);
          }
        } else if (op === 11) {
          awaitingAck = false;
        } else if (op === 1) {
          pulse();
        } else if (op === 7 || op === 9) {
          finish(null);
        } else if (op === 0 && t === 'GUILD_CREATE') {
          const guild = guildSchema.safeParse(d);
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
            finish({
              empty: targets
                .filter((target) => {
                  const state = states.get(target.guildId)!;
                  return state.channels.has(target.discordChannelId) && !state.occupied.has(target.discordChannelId);
                })
                .map((target) => target.discordChannelId),
              missing: targets
                .filter((target) => !states.get(target.guildId)!.channels.has(target.discordChannelId))
                .map((target) => target.discordChannelId),
            });
          }
        } else if (op === 0 && t === 'VOICE_STATE_UPDATE') {
          const update = updateSchema.safeParse(d);
          if (!update.success) {
            finish(null);
            return;
          }
          /* An earlier guild snapshot may already be stale while another guild is still arriving. */
          if (states.has(update.data.guild_id)) {
            finish(null, 'changed');
          }
        } else if (op === 0 && t === 'GUILD_DELETE') {
          finish(null);
        }
      });
    } catch {
      finish(null, 'transport');
    }
  });
}
