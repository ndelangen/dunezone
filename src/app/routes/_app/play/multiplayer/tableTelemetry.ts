import type { ClientMessage } from '@shared/play/protocol';

/* How often a browser tells the room how the table felt; the room folds the latest report into its own summary. */
export const TELEMETRY_REPORT_MS = 5 * 60_000;
/* Bounds for a tab left open for hours: the oldest unanswered command and the oldest timing are dropped first. */
const PENDING_LIMIT = 64;
const SAMPLE_LIMIT = 1024;

type TelemetryReport = Extract<ClientMessage, { type: 'telemetry' }>;

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
}

/**
 * What one player felt at the table: how long each saved action took from sending it to the room's receipt, and how often the page itself stalled.
 * It records durations only, never what the action was.
 */
export class TableTelemetry {
  private readonly pending = new Map<string, number>();
  private samples: number[] = [];
  private longTasks = 0;
  private worstLongTaskMs = 0;

  constructor(private readonly now: () => number) {}

  sent(commandId: string) {
    if (this.pending.size >= PENDING_LIMIT) {
      this.pending.delete(this.pending.keys().next().value!);
    }
    this.pending.set(commandId, this.now());
  }

  /** A receipt for a command this page sent; a receipt for another page's command is ignored. */
  completed(commandId: string | undefined) {
    const sentAt = commandId === undefined ? undefined : this.pending.get(commandId);
    if (sentAt === undefined) {
      return;
    }
    this.pending.delete(commandId!);
    this.samples.push(Math.max(0, Math.round(this.now() - sentAt)));
    if (this.samples.length > SAMPLE_LIMIT) {
      this.samples.shift();
    }
  }

  rejected(commandId: string) {
    this.pending.delete(commandId);
  }

  longTask(durationMs: number) {
    this.longTasks++;
    this.worstLongTaskMs = Math.max(this.worstLongTaskMs, Math.round(durationMs));
  }

  /** The report since the last one, or nothing when the page neither acted nor stalled. */
  report(): TelemetryReport | null {
    if (!this.samples.length && !this.longTasks) {
      return null;
    }
    const sorted = this.samples.toSorted((left, right) => left - right);
    const report: TelemetryReport = {
      type: 'telemetry',
      actions: {
        count: sorted.length,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        maxMs: sorted.at(-1) ?? 0,
      },
      longTasks: { count: this.longTasks, worstMs: this.worstLongTaskMs },
    };
    this.samples = [];
    this.longTasks = 0;
    this.worstLongTaskMs = 0;
    return report;
  }
}
