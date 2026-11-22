import type { RoomCounters } from './roomSummary';

/* Above a steady load cell's 720 saved commands, so a cell's metrics request still finds its first. */
const COMMAND_TIMINGS = 1024;
/** A sweep this late counts as a stall, and the room keeps the most recent ones. */
const STALL_MS = 250;
const STALLS = 64;

/**
 * When the room began handling one saved command, by its own clock, and when it was durable.
 * A Worker's clock stands still while code runs, so only when handling began is meaningful, not how long it took.
 */
export type CommandTiming = { userId: string; commandId: string; handledAt: number; durableAt?: number };

/** The room's counters for the load runner's metrics request and the room summary; a woken room counts from zero. */
export class RoomMetrics implements RoomCounters {
  motionReceived = 0;
  motionForwarded = 0;
  motionDropped = 0;
  activityDeliveries = 0;
  messagesSent = 0;
  bytesSent = 0;
  /* A spawn request is timed after its catalogue read, so its entry includes that read. */
  private readonly commandTimings: CommandTiming[] = [];
  /* Recent sweeps that ran late by more than STALL_MS: a busy room fires its timers late, while a held output does not. */
  private readonly stalls: { at: number; lateMs: number }[] = [];
  private sweptAt: number | undefined;

  counters(): RoomCounters {
    return {
      motionReceived: this.motionReceived,
      motionForwarded: this.motionForwarded,
      motionDropped: this.motionDropped,
      activityDeliveries: this.activityDeliveries,
      messagesSent: this.messagesSent,
      bytesSent: this.bytesSent,
    };
  }

  /** Starts timing a saved command; the caller sets `durableAt` once its write is durable. */
  command(userId: string, commandId: string, now: number): CommandTiming {
    const timing: CommandTiming = { userId, commandId, handledAt: now };
    this.commandTimings.push(timing);
    if (this.commandTimings.length > COMMAND_TIMINGS) {
      this.commandTimings.shift();
    }
    return timing;
  }

  /** Counts one frame the room sent, and whether it carried only activity. */
  sent(bytes: number, activityOnly: boolean) {
    this.messagesSent++;
    if (activityOnly) {
      this.activityDeliveries++;
    }
    this.bytesSent += bytes;
  }

  /** Notes a sweep at `now`; returns how late it ran when that counts as a stall. */
  swept(now: number, sweepMs: number): number | undefined {
    const lateMs = this.sweptAt === undefined ? 0 : now - this.sweptAt - sweepMs;
    this.sweptAt = now;
    if (lateMs <= STALL_MS) {
      return undefined;
    }
    this.stalls.push({ at: now, lateMs });
    if (this.stalls.length > STALLS) {
      this.stalls.shift();
    }
    return lateMs;
  }

  /** A stopped sweep has no previous run, so the next one starts a fresh interval. */
  sweepStopped() {
    this.sweptAt = undefined;
  }

  /** The counters, this player's recent command timings and the recent stalls, as a metrics frame carries them. */
  report(userId: string | undefined) {
    return {
      ...this.counters(),
      commands: this.commandTimings
        .filter((timing) => timing.userId === userId)
        .map(({ commandId, handledAt, durableAt }) => ({ commandId, handledAt, durableAt })),
      stalls: this.stalls,
    };
  }
}
