import type { ClientMessage } from '../../src/shared/play/protocol';

/* One summary per room per interval: about six log lines a game-hour, well inside the account's log allowance. */
export const ROOM_SUMMARY_MS = 10 * 60_000;
/* A room that goes quiet writes its line early, once this long has passed, since hibernation drops what it has not written. */
export const ROOM_SUMMARY_IDLE_MS = 60_000;
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
 * and no account, seat, faction or game content is ever recorded. Counters live in memory, so an
 * object restart starts a fresh interval; a summary covers what this instance saw.
 */
export class RoomSummary {
  private since: number;
  private base: RoomCounters = ZERO;
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

  due(now: number, interval = ROOM_SUMMARY_MS) {
    return now - this.since >= interval;
  }

  /** Writes one summary line when anything happened since the last one, then starts the next interval. */
  flush(counters: RoomCounters, connections: number, reason: 'interval' | 'empty' | 'idle', now = Date.now()) {
    const delta = Object.fromEntries(
      Object.entries(counters).map(([key, value]) => [key, value - this.base[key as keyof RoomCounters]])
    ) as RoomCounters;
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
