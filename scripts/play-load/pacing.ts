export type ActionSlot = { index: number; scheduledAt: number; offeredAt: number; latenessMs: number } & (
  | { status: 'skipped'; reason: string; dispatchedAt?: never }
  | { status: 'dispatched'; dispatchedAt: number; reason?: never }
);
type ActionSchedule = {
  startedAt: number;
  durationMs: number;
  rate: number;
  step: (slot: ActionSlot) => Promise<unknown>;
  stopping: () => boolean;
  onSlot: (slot: ActionSlot) => void;
};
import { failureMessage } from './failure.ts';

function skipReason({
  stopped,
  failed,
  late,
  inFlight,
}: {
  stopped: boolean;
  failed: boolean;
  late: boolean;
  inFlight: boolean;
}) {
  if (stopped) {
    return 'stopped';
  }
  if (failed) {
    return 'prior-interaction-failed';
  }
  if (late) {
    return 'coordinator-late';
  }
  return inFlight ? 'prior-interaction-in-flight' : undefined;
}

function scheduleStatus({ stopped, skipped, failed }: { stopped: boolean; skipped: number; failed: boolean }) {
  if (stopped) {
    return 'incomplete';
  }
  return skipped || failed ? 'failed' : 'complete';
}

/**
 * Offers every scheduled intent without waiting for a response or bursting after a delayed tick.
 * The revisioned trace allows one interaction in flight;
 * busy slots fail the offered workload instead of changing its rate.
 */
export async function runActionSchedule({ startedAt, durationMs, rate, step, stopping, onSlot }: ActionSchedule) {
  const interval = 1000 / rate;
  const scheduled = Math.ceil(durationMs / interval);
  let active: Promise<unknown> | undefined;
  let failed = false;
  let failure: string | undefined;
  let lastDispatch = -Infinity;
  let dispatched = 0;
  let skipped = 0;
  for (let index = 0; index < scheduled; index++) {
    const scheduledAt = startedAt + index * interval;
    if (!stopping()) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, Math.max(scheduledAt, lastDispatch + interval) - performance.now()))
      );
    }
    const at = performance.now();
    const reason = skipReason({
      stopped: stopping(),
      failed,
      late: at >= startedAt + durationMs || at - scheduledAt >= interval,
      inFlight: active !== undefined,
    });
    const slot: ActionSlot = {
      index,
      scheduledAt,
      offeredAt: at,
      latenessMs: Math.max(0, at - scheduledAt),
      ...(reason ? { status: 'skipped' as const, reason } : { status: 'dispatched' as const, dispatchedAt: at }),
    };
    onSlot(slot);
    if (reason) {
      skipped++;
      continue;
    }
    lastDispatch = at;
    dispatched++;
    active = Promise.resolve()
      .then(() => step(slot))
      .catch((error) => {
        failed = true;
        failure = failureMessage(error);
      })
      .finally(() => {
        active = undefined;
      });
  }
  await active;
  return {
    scheduled,
    dispatched,
    skipped,
    maxInFlight: 1,
    failed: failure,
    status: scheduleStatus({ stopped: stopping(), skipped, failed }),
  };
}
