import type { MotionKind, Phase, Recipient } from './types.ts';
type MotionOutcome = 'pending' | 'transmitted' | 'coalesced' | 'skippedRotation' | 'skippedStop' | 'skippedFailure';
type MotionCounts = { scheduled: number } & Record<MotionOutcome, number>;
export type MotionInput<P extends Recipient> = {
  peer: P;
  index: number;
  kind: MotionKind;
  phase: Phase;
  seq: number;
  round: number;
  scheduledAt: number;
};
type MotionOptions<P extends Recipient> = {
  startedAt: number;
  durationMs: number;
  warmupMs: number;
  rate: number;
  rotationMs: number;
  players: P[];
  moverCount: number;
  rotate: (round: number) => Promise<void>;
  transmit: (input: MotionInput<P>) => boolean;
  stopping: () => boolean;
};
type MotionReport = {
  totals: MotionCounts;
  byPhase: Partial<Record<Phase, Partial<Record<MotionKind, MotionCounts>>>>;
  bySource: Record<number, Partial<Record<MotionKind, MotionCounts>>>;
  gaps: { from: number; to: number; reason: MotionOutcome }[];
  scheduledWindowMs: number;
  failure?: string;
  elapsedMs?: number;
  coordinatorLateness?: ReturnType<typeof distribution>;
  achievedHzPerActiveSource?: number;
  pointerHz?: number;
  poseHz?: number;
  status?: 'incomplete' | 'failed' | 'complete';
};
import { failureMessage } from './failure.ts';
import { distribution } from './measurements.ts';

/** Runs the fixed mover schedule and accounts for every input even when rotation or delivery fails. */
export async function runMotionSchedule<P extends Recipient>({
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
}: MotionOptions<P>) {
  const interval = 1000 / rate;
  const slots = Math.ceil(durationMs / interval);
  const fresh = (): MotionCounts => ({
    scheduled: 0,
    pending: 0,
    transmitted: 0,
    coalesced: 0,
    skippedRotation: 0,
    skippedStop: 0,
    skippedFailure: 0,
  });
  const report: MotionReport = { totals: fresh(), byPhase: {}, bySource: {}, gaps: [], scheduledWindowMs: durationMs };
  const lateness: number[] = [];
  const inputs = (seq: number) => {
    const phase: Phase = seq * interval < warmupMs ? 'warmup' : 'measured';
    const round = Math.floor((seq * interval) / rotationMs);
    return Array.from({ length: moverCount }, (_, index) => {
      const peer = players[(round * moverCount + index) % players.length];
      return (['pointer', 'pose'] as const).map((kind): MotionInput<P> => ({
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
  const counters = ({ peer, phase, kind }: MotionInput<P>) => {
    const phaseCounts = (report.byPhase[phase] ??= {});
    const sourceCounts = (report.bySource[peer.index] ??= {});
    return [report.totals, (phaseCounts[kind] ??= fresh()), (sourceCounts[kind] ??= fresh())];
  };
  const count = (input: MotionInput<P>, outcome: MotionOutcome) => {
    for (const row of counters(input)) {
      if (outcome === 'pending') {
        row.scheduled++;
      } else {
        row.pending--;
      }
      row[outcome]++;
    }
  };
  /* Every input of the slots from `from` up to `to`, accounted for under one outcome. */
  const countSlots = (from: number, to: number, outcome: MotionOutcome) => {
    for (let slot = from; slot < to; slot++) {
      for (const input of inputs(slot)) {
        count(input, outcome);
      }
    }
  };
  countSlots(0, slots, 'pending');
  let seq = 0;
  let group = 0;
  let gapReason: MotionOutcome = 'coalesced';
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
        countSlots(seq, current, gapReason);
        seq = current;
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
    report.failure = failureMessage(error);
  } finally {
    closeMotionReport(report, { seq, slots, lateness, startedAt, durationMs, moverCount, stopping });
  }
  return report;
}

/** Every input still pending is skipped for the reason the run ended, and the achieved rates are taken. */
function closeMotionReport(
  report: MotionReport,
  {
    seq,
    slots,
    lateness,
    startedAt,
    durationMs,
    moverCount,
    stopping,
  }: {
    seq: number;
    slots: number;
    lateness: number[];
    startedAt: number;
    durationMs: number;
    moverCount: number;
    stopping: () => boolean;
  }
) {
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
  for (const kind of ['pointer', 'pose'] as const) {
    const transmitted = Object.values(report.byPhase).reduce((sum, phase) => sum + (phase[kind]?.transmitted ?? 0), 0);
    report[`${kind}Hz`] = transmitted / moverCount / (durationMs / 1000);
  }
  report.status = stopping() ? 'incomplete' : report.failure ? 'failed' : 'complete';
}
