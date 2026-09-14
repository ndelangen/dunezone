import { distribution } from './measurements.mjs';

/** Runs the fixed mover schedule and accounts for every input even when rotation or delivery fails. */
export async function runMotionSchedule({
  startedAt,
  durationMs,
  warmupMs,
  rate,
  rotationMs,
  players,
  moverCount,
  rotate,
  transmit,
  stopping,
}) {
  const interval = 1000 / rate;
  const slots = Math.ceil(durationMs / interval);
  const fresh = () => ({
    scheduled: 0,
    pending: 0,
    transmitted: 0,
    coalesced: 0,
    skippedRotation: 0,
    skippedStop: 0,
    skippedFailure: 0,
  });
  const report = { totals: fresh(), byPhase: {}, bySource: {}, gaps: [], scheduledWindowMs: durationMs };
  const lateness = [];
  const inputs = (seq) => {
    const phase = seq * interval < warmupMs ? 'warmup' : 'measured';
    const round = Math.floor((seq * interval) / rotationMs);
    return Array.from({ length: moverCount }, (_, index) => {
      const peer = players[(round * moverCount + index) % players.length];
      return ['pointer', 'pose'].map((kind) => ({
        peer,
        index,
        kind,
        phase,
        seq,
        round,
        scheduledAt: startedAt + seq * interval,
      }));
    }).flat();
  };
  const counters = ({ peer, phase, kind }) => {
    const phaseCounts = (report.byPhase[phase] ??= {});
    const sourceCounts = (report.bySource[peer.index] ??= {});
    return [report.totals, (phaseCounts[kind] ??= fresh()), (sourceCounts[kind] ??= fresh())];
  };
  const count = (input, outcome) => {
    for (const row of counters(input)) {
      if (outcome === 'pending') {
        row.scheduled++;
      } else {
        row.pending--;
      }
      row[outcome]++;
    }
  };
  for (let seq = 0; seq < slots; seq++) {
    for (const input of inputs(seq)) {
      count(input, 'pending');
    }
  }
  let seq = 0;
  let group = 0;
  let gapReason = 'coalesced';
  try {
    while (!stopping() && seq < slots) {
      const due = startedAt + seq * interval;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - performance.now())));
      if (stopping()) {
        break;
      }
      const now = performance.now();
      if (now < due) {
        continue;
      }
      const current = Math.min(slots, Math.floor((now - startedAt) / interval));
      if (current > seq) {
        report.gaps.push({ from: seq, to: current - 1, reason: gapReason });
        for (; seq < current; seq++) {
          for (const input of inputs(seq)) {
            count(input, gapReason);
          }
        }
      }
      gapReason = 'coalesced';
      if (seq >= slots) {
        break;
      }
      const nextGroup = Math.floor((seq * interval) / rotationMs);
      if (nextGroup !== group) {
        await rotate(nextGroup);
        group = nextGroup;
        gapReason = 'skippedRotation';
        continue;
      }
      lateness.push(Math.max(0, now - (startedAt + seq * interval)));
      for (const input of inputs(seq)) {
        count(input, transmit(input) ? 'transmitted' : 'skippedStop');
      }
      seq++;
    }
  } catch (error) {
    report.failure = error.message;
  } finally {
    const reason = stopping() ? 'skippedStop' : report.failure ? 'skippedFailure' : 'coalesced';
    if (report.totals.pending) {
      report.gaps.push({ from: seq, to: slots - 1, reason });
    }
    const rows = [
      report.totals,
      ...Object.values(report.byPhase).flatMap(Object.values),
      ...Object.values(report.bySource).flatMap(Object.values),
    ];
    for (const row of rows) {
      row[reason] += row.pending;
      row.pending = 0;
    }
    report.coordinatorLateness = distribution(lateness);
    report.elapsedMs = performance.now() - startedAt;
    report.achievedHzPerActiveSource = report.totals.transmitted / 2 / moverCount / (durationMs / 1000);
    for (const kind of ['pointer', 'pose']) {
      const transmitted = Object.values(report.byPhase).reduce(
        (sum, phase) => sum + (phase[kind]?.transmitted ?? 0),
        0
      );
      report[`${kind}Hz`] = transmitted / moverCount / (durationMs / 1000);
    }
    report.status = stopping() ? 'incomplete' : report.failure ? 'failed' : 'complete';
  }
  return report;
}
