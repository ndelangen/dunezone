import type { ClientMessage } from '../../src/shared/play/protocol';

/* One summary per room per interval: about six log lines a game-hour, well inside the account's log allowance. */
export const ROOM_SUMMARY_MS = 10 * 60_000;
/* A long session keeps at most this many command timings between summaries; the oldest are dropped first. */
const COMMAND_SAMPLES = 2048;

/** The room's cumulative counters, read at each summary so the line reports what changed since the last one. */
export type RoomCounters = {
  motionReceived: number;
  motionForwarded: number;
  motionDropped: number;
  activityDeliveries: number;
  messagesSent: number;
  bytesSent: number;
};
export type ConvexCall = { path: string; durationMs: number; ok: boolean };
type ClientReport = Omit<Extract<ClientMessage, { type: 'telemetry' }>, 'type'>;
type CallTotals = { calls: number; failures: number; totalMs: number; maxMs: number };
/** An unwritten interval, kept in storage while the room hibernates; its counters are the change it saw, since a woken room counts from zero. */
export type SavedSummary = {
  since: number;
  carried: RoomCounters;
  messagesIn: number;
  peakConnections: number;
  commandMs: number[];
  commandCount: number;
  commandMaxMs: number;
  stalls: number;
  worstStallMs: number;
  convex: [string, CallTotals][];
  clients: [string, ClientReport][];
};

function percentile(sorted: number[], fraction: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]! : 0;
}

/* The count and maximum cover every command; the percentiles come from the kept samples. */
function spread(samples: number[], count: number, maxMs: number) {
  const sorted = samples.toSorted((left, right) => left - right);
  return {
    count,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs,
  };
}

const ZERO: RoomCounters = {
  motionReceived: 0,
  motionForwarded: 0,
  motionDropped: 0,
  activityDeliveries: 0,
  messagesSent: 0,
  bytesSent: 0,
};

/*
 * A periodic account of one room's load, for measuring a live session without tracing.
 * It holds counts and durations only: the opaque room identity comes from the diagnostics context,
 * and no account, seat, faction or game content is ever recorded. Counters live in memory; a room
 * that may hibernate saves its unwritten interval, and an object restart otherwise starts a fresh one.
 */
export class RoomSummary {
  private since: number;
  private base: RoomCounters = ZERO;
  /* What an interval saved before a hibernation had already counted. */
  private carried: RoomCounters = ZERO;
  private messagesIn = 0;
  private peakConnections = 0;
  private commandMs: number[] = [];
  private commandCount = 0;
  private commandMaxMs = 0;
  private stalls = 0;
  private worstStallMs = 0;
  private readonly convex = new Map<string, CallTotals>();
  private readonly clients = new Map<string, ClientReport>();

  constructor(
    private readonly context: () => Record<string, unknown>,
    now = Date.now()
  ) {
    this.since = now;
  }

  message() {
    this.messagesIn++;
  }

  connections(count: number) {
    this.peakConnections = Math.max(this.peakConnections, count);
  }

  /** How long a saved command took from the room starting it to its storage write being confirmed. */
  command(durableMs: number) {
    const ms = Math.max(0, durableMs);
    this.commandCount++;
    this.commandMaxMs = Math.max(this.commandMaxMs, ms);
    this.commandMs.push(ms);
    if (this.commandMs.length > COMMAND_SAMPLES) {
      this.commandMs.shift();
    }
  }

  stall(lateMs: number) {
    this.stalls++;
    this.worstStallMs = Math.max(this.worstStallMs, lateMs);
  }

  convexCall({ path, durationMs, ok }: ConvexCall) {
    const totals = this.convex.get(path) ?? { calls: 0, failures: 0, totalMs: 0, maxMs: 0 };
    totals.calls++;
    totals.failures += ok ? 0 : 1;
    totals.totalMs += durationMs;
    totals.maxMs = Math.max(totals.maxMs, durationMs);
    this.convex.set(path, totals);
  }

  /** A browser's own account of how the table felt; the latest report from each connection counts. */
  client(connectionId: string, report: ClientReport) {
    this.clients.set(connectionId, report);
  }

  due(now: number) {
    return now - this.since >= ROOM_SUMMARY_MS;
  }

  private delta(counters: RoomCounters) {
    return Object.fromEntries(
      Object.entries(counters).map(([key, value]) => {
        const name = key as keyof RoomCounters;
        return [name, value - this.base[name] + this.carried[name]];
      })
    ) as RoomCounters;
  }

  /** Whether the current interval holds anything a line would report. */
  pending(counters: RoomCounters) {
    return this.messagesIn > 0 || this.delta(counters).messagesSent > 0 || this.convex.size > 0;
  }

  /** The unwritten interval, for a room about to hibernate. */
  save(counters: RoomCounters): SavedSummary {
    return {
      since: this.since,
      carried: this.delta(counters),
      messagesIn: this.messagesIn,
      peakConnections: this.peakConnections,
      commandMs: this.commandMs,
      commandCount: this.commandCount,
      commandMaxMs: this.commandMaxMs,
      stalls: this.stalls,
      worstStallMs: this.worstStallMs,
      convex: [...this.convex],
      clients: [...this.clients],
    };
  }

  /** Resumes an interval saved before a hibernation, in a room whose counters start again from zero. */
  restore(saved: SavedSummary) {
    this.since = saved.since;
    this.base = ZERO;
    this.carried = saved.carried;
    this.messagesIn = saved.messagesIn;
    this.peakConnections = Math.max(this.peakConnections, saved.peakConnections);
    this.commandMs = saved.commandMs;
    this.commandCount = saved.commandCount;
    this.commandMaxMs = saved.commandMaxMs;
    this.stalls = saved.stalls;
    this.worstStallMs = saved.worstStallMs;
    this.convex.clear();
    for (const [path, totals] of saved.convex) {
      this.convex.set(path, totals);
    }
    this.clients.clear();
    for (const [connectionId, report] of saved.clients) {
      this.clients.set(connectionId, report);
    }
  }

  /** Writes one summary line when anything happened since the last one, then starts the next interval. */
  flush(counters: RoomCounters, connections: number, reason: 'interval' | 'empty', now = Date.now()) {
    const delta = this.delta(counters);
    const active = this.messagesIn > 0 || delta.messagesSent > 0 || this.convex.size > 0;
    if (active) {
      const clients = [...this.clients.values()];
      console.info({
        event: 'game-room-summary',
        ...this.context(),
        reason,
        intervalMs: Math.max(0, now - this.since),
        connections,
        peakConnections: Math.max(this.peakConnections, connections),
        messagesIn: this.messagesIn,
        ...delta,
        commands: spread(this.commandMs, this.commandCount, this.commandMaxMs),
        stalls: this.stalls,
        worstStallMs: this.worstStallMs,
        convex: Object.fromEntries(this.convex),
        clients: {
          reports: clients.length,
          /* The slowest browser at the table, so a fast room never hides a struggling player. */
          worstActionP95Ms: Math.max(0, ...clients.map((client) => client.actions.p95Ms)),
          worstActionMaxMs: Math.max(0, ...clients.map((client) => client.actions.maxMs)),
          actions: clients.reduce((total, client) => total + client.actions.count, 0),
          longTasks: clients.reduce((total, client) => total + client.longTasks.count, 0),
          worstLongTaskMs: Math.max(0, ...clients.map((client) => client.longTasks.worstMs)),
        },
      });
    }
    this.since = now;
    this.base = { ...counters };
    this.carried = ZERO;
    this.messagesIn = 0;
    this.peakConnections = connections;
    this.commandMs = [];
    this.commandCount = 0;
    this.commandMaxMs = 0;
    this.stalls = 0;
    this.worstStallMs = 0;
    this.convex.clear();
    this.clients.clear();
    return active;
  }
}
