import { failureMessage } from './failure.mjs';

function skipReason({ stopped, failed, late, inFlight }) {
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

function scheduleStatus({ stopped, skipped, failed }) {
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
export async function runActionSchedule({ startedAt, durationMs, rate, step, stopping, onSlot }) {
  const interval = 1000 / rate;
  const scheduled = Math.ceil(durationMs / interval);
  let active;
  let failed = false;
  let failure;
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
    const slot = {
      index,
      scheduledAt,
      offeredAt: at,
      latenessMs: Math.max(0, at - scheduledAt),
      status: reason ? 'skipped' : 'dispatched',
      ...(reason ? { reason } : { dispatchedAt: at }),
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
