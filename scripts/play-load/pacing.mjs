/**
 * Offers every scheduled intent without waiting for a response or bursting after a delayed tick.
 * The revisioned trace allows one interaction in flight;
 * busy slots fail the offered workload instead of changing its rate.
 */
export async function runActionSchedule({ startedAt, durationMs, rate, step, stopping, onSlot }) {
  const interval = 1000 / rate;
  const scheduled = Math.ceil(durationMs / interval);
  let active;
  let failed;
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
    const reason = stopping()
      ? 'stopped'
      : failed
        ? 'prior-interaction-failed'
        : at >= startedAt + durationMs || at - scheduledAt >= interval
          ? 'coordinator-late'
          : active
            ? 'prior-interaction-in-flight'
            : undefined;
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
        failed = error.message;
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
    failed,
    status: stopping() ? 'incomplete' : skipped || failed ? 'failed' : 'complete',
  };
}
