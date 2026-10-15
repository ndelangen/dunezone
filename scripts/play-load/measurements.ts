import { createWriteStream } from 'node:fs';
import type { PathLike } from 'node:fs';
import { finished } from 'node:stream/promises';

import type { MotionEntry, MotionKind, MotionSample, Recipient } from './types.ts';

type RetainedSample = MotionSample & { stream: string; seq: number; superseded: Set<number> };

class Histogram {
  bins = new Uint32Array(60_001);
  samples = 0;
  max: number | null = null;
  add(ms: number) {
    this.bins[Math.min(60_000, Math.floor(ms))]++;
    this.samples++;
    this.max = Math.max(this.max ?? 0, ms);
  }
  percentile(fraction: number) {
    if (!this.samples) {
      return null;
    }
    const target = Math.ceil(this.samples * fraction);
    let count = 0;
    for (const [ms, frequency] of this.bins.entries()) {
      count += frequency;
      if (count >= target) {
        return ms;
      }
    }
    return null;
  }
  summary() {
    return {
      samples: this.samples,
      p50: this.percentile(0.5),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
      max: this.max,
    };
  }
}

/** Raw observations stream to disk; one-millisecond histograms bound retained timing data. */
export function measurements(filename: PathLike, stop: (reason: string) => void, peers: readonly Recipient[] = []) {
  const output = createWriteStream(filename, { flags: 'wx', highWaterMark: 65_536 });
  let failure: string | undefined;
  let dropped = 0;
  output.on('error', (error) => {
    failure = error.message;
    stop('observation-write-failed');
  });
  const all = new Histogram();
  const phases = new Map<string, Histogram>();
  const clients = new Map<number, { all: Histogram; measured: Histogram }>();
  const classes = new Map<string, Histogram>();
  const missingByClientPhase = new Map<string, number>();
  const pending = new Map<string, RetainedSample>();
  const streams = new Map<string, Map<number, { key: string; sample: RetainedSample }>>();
  let superseded = 0;
  const latest = new Map<string, { key: string; sample: RetainedSample }>();
  const missingByPhase = new Map<string, number>();
  const missingByClient = new Map<number, number>();
  let missing = 0;
  let expired = 0;
  let maxPending = 0;
  function write(row: object) {
    if (failure || output.writableLength >= 1_048_576) {
      dropped++;
      stop('observation-backpressure');
      return;
    }
    output.write(JSON.stringify(row) + '\n');
  }
  function histogram<K>(map: Map<K, Histogram>, key: K) {
    if (!map.has(key)) {
      map.set(key, new Histogram());
    }
    return map.get(key)!;
  }
  function missingRecipients(sample: RetainedSample) {
    return [...sample.expected].filter((recipient) => !sample.seen.has(recipient) && !sample.superseded.has(recipient));
  }
  function increment<K>(map: Map<K, number>, key: K) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  function retire(key: string, sample: RetainedSample) {
    for (const recipient of missingRecipients(sample)) {
      missing++;
      increment(missingByPhase, sample.phase);
      increment(missingByClient, recipient);
      increment(missingByClientPhase, `${recipient}/${sample.phase}`);
    }
    pending.delete(key);
    streams.get(sample.stream)?.delete(sample.seq);
  }
  /* Every recipient of a settled sample either saw it or was superseded past it. */
  function retireIfSettled(key: string, sample: RetainedSample) {
    if (sample.seen.size + sample.superseded.size === sample.expected.size) {
      retire(key, sample);
    }
  }
  /* An observation of a later frame supersedes every earlier one of its stream the recipient has not seen. */
  function supersedeEarlier(peer: Recipient, kind: MotionKind, entry: MotionEntry) {
    const skipped = [];
    for (const [seq, prior] of streams.get(`${kind}/${entry.connectionId}`) ?? []) {
      if (entry.sourceSeq === undefined || seq >= entry.sourceSeq) {
        break;
      }
      const sample = prior.sample;
      if (sample.expected.has(peer.index) && !sample.seen.has(peer.index) && !sample.superseded.has(peer.index)) {
        sample.superseded.add(peer.index);
        superseded++;
        skipped.push(seq);
      }
      retireIfSettled(prior.key, sample);
    }
    if (skipped.length) {
      write({
        superseded: skipped,
        kind,
        connectionId: entry.connectionId,
        recipient: peer.index,
        bySeq: entry.sourceSeq,
      });
    }
  }
  function expire() {
    const deadline = performance.now() - 30_000;
    for (const [key, sample] of pending) {
      if (sample.at >= deadline) {
        break;
      }
      expired++;
      write({
        expired: key,
        missingRecipients: missingRecipients(sample),
      });
      retire(key, sample);
    }
  }
  function finalObservations(sources?: ReadonlySet<number>) {
    return [...latest.values()]
      .filter(({ sample }) => !sources || sources.has(sample.source))
      .map(({ key, sample }) => ({
        key,
        missingRecipients: missingRecipients(sample),
      }));
  }
  const timer = setInterval(expire, 1000);
  return {
    outstanding(sources?: ReadonlySet<number>) {
      return finalObservations(sources).filter((sample) => sample.missingRecipients.length);
    },
    add(key: string, input: MotionSample) {
      const sample: RetainedSample = Object.assign(input, { stream: '', seq: 0, superseded: new Set<number>() });
      if (pending.size >= 30_000) {
        stop('pending-sample-budget');
        return;
      }
      const parts = key.split('/');
      sample.stream = parts.slice(0, -1).join('/');
      sample.seq = Number(parts.at(-1));
      sample.superseded = new Set<number>();
      if (!streams.has(sample.stream)) {
        streams.set(sample.stream, new Map<number, { key: string; sample: RetainedSample }>());
      }
      streams.get(sample.stream)!.set(sample.seq, { key, sample });
      pending.set(key, sample);
      maxPending = Math.max(maxPending, pending.size);
      latest.set(`${key.split('/')[0]}/${sample.source}`, { key, sample });
    },
    observe(peer: Recipient, kind: MotionKind, entry: MotionEntry) {
      if (!Number.isSafeInteger(entry.sourceSeq)) {
        return;
      }
      supersedeEarlier(peer, kind, entry);
      const key = `${kind}/${entry.connectionId}/${entry.sourceSeq}`;
      const sample = pending.get(key);
      if (!sample?.expected.has(peer.index)) {
        return;
      }
      if (sample.seen.has(peer.index)) {
        return;
      }
      sample.seen.add(peer.index);
      const ms = performance.now() - sample.at;
      write({
        phase: sample.phase,
        recipient: peer.index,
        kind,
        seq: entry.sourceSeq,
        source: sample.source,
        ms,
        scheduledAt: sample.at,
        dispatchedAt: sample.dispatchedAt,
      });
      all.add(ms);
      histogram(phases, sample.phase).add(ms);
      if (sample.phase === 'measured') {
        histogram(classes, `${peer.browser ? 'browser' : 'protocol'}-${peer.role}`).add(ms);
      }
      const client = clients.get(peer.index) ?? { all: new Histogram(), measured: new Histogram() };
      clients.set(peer.index, client);
      client.all.add(ms);
      if (sample.phase === 'measured') {
        client.measured.add(ms);
      }
      retireIfSettled(key, sample);
    },
    async finish() {
      clearInterval(timer);
      for (const [key, sample] of pending) {
        retire(key, sample);
      }
      output.end();
      await finished(output).catch((error) => {
        failure = error.message;
      });
      for (const peer of peers) {
        histogram(classes, `${peer.browser ? 'browser' : 'protocol'}-${peer.role}`);
      }
      return {
        motion: all.summary(),
        motionByRecipientClass: Object.fromEntries(
          [...classes].map(([name, histogram]) => [name, histogram.summary()])
        ),
        motionByPhase: Object.fromEntries(
          ['warmup', 'measured'].map((phase) => [phase, histogram(phases, phase).summary()])
        ),
        missingDeliveries: missing,
        supersededDeliveries: superseded,
        missingDeliveriesByPhase: Object.fromEntries(
          ['warmup', 'measured'].map((phase) => [phase, missingByPhase.get(phase) ?? 0])
        ),
        finalMotion: finalObservations(),
        observationStorage: {
          failure,
          dropped,
          expiredSamples: expired,
          maxPending,
          pendingLimit: 30_000,
          deliveryDeadlineMs: 30_000,
          queueLimitBytes: 1_048_576,
          quantileResolutionMs: 1,
          quantileOverflowMs: 60_000,
        },
      };
    },
    client(index: number) {
      const client = clients.get(index) ?? { all: new Histogram(), measured: new Histogram() };
      return {
        ...client.all.summary(),
        measured: client.measured.summary(),
        missingDeliveries: missingByClient.get(index) ?? 0,
        measuredMissingDeliveries: missingByClientPhase.get(`${index}/measured`) ?? 0,
      };
    },
  };
}

function percentile(values: readonly number[], fraction: number) {
  return values.length
    ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
    : null;
}
export function distribution(values: readonly number[]) {
  return {
    samples: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? values.reduce((maximum: number, value: number) => Math.max(maximum, value), 0) : null,
  };
}
