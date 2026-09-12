import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

class Histogram {
  bins = new Uint32Array(60_001);
  samples = 0;
  max = null;
  add(ms) {
    this.bins[Math.min(60_000, Math.floor(ms))]++;
    this.samples++;
    this.max = Math.max(this.max ?? 0, ms);
  }
  percentile(fraction) {
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
export function measurements(filename, stop) {
  const output = createWriteStream(filename, { flags: 'wx', highWaterMark: 65_536 });
  let failure;
  let dropped = 0;
  output.on('error', (error) => {
    failure = error.message;
    stop('observation-write-failed');
  });
  const all = new Histogram();
  const phases = new Map();
  const clients = new Map();
  const pending = new Map();
  const streams = new Map();
  let superseded = 0;
  const latest = new Map();
  const missingByPhase = new Map();
  const missingByClient = new Map();
  let missing = 0;
  let expired = 0;
  let maxPending = 0;
  function write(row) {
    if (failure || output.writableLength >= 1_048_576) {
      dropped++;
      stop('observation-backpressure');
      return;
    }
    output.write(JSON.stringify(row) + '\n');
  }
  function histogram(map, key) {
    if (!map.has(key)) {
      map.set(key, new Histogram());
    }
    return map.get(key);
  }
  function retire(key, sample) {
    for (const recipient of sample.expected) {
      if (sample.seen.has(recipient) || sample.superseded?.has(recipient)) {
        continue;
      }
      missing++;
      missingByPhase.set(sample.phase, (missingByPhase.get(sample.phase) ?? 0) + 1);
      missingByClient.set(recipient, (missingByClient.get(recipient) ?? 0) + 1);
    }
    pending.delete(key);
    streams.get(sample.stream)?.delete(sample.seq);
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
        missingRecipients: [...sample.expected].filter(
          (recipient) => !sample.seen.has(recipient) && !sample.superseded?.has(recipient)
        ),
      });
      retire(key, sample);
    }
  }
  const timer = setInterval(expire, 1000);
  return {
    add(key, sample) {
      if (pending.size >= 30_000) {
        stop('pending-sample-budget');
        return;
      }
      const parts = key.split('/');
      sample.stream = parts.slice(0, -1).join('/');
      sample.seq = Number(parts.at(-1));
      sample.superseded = new Set();
      if (!streams.has(sample.stream)) {
        streams.set(sample.stream, new Map());
      }
      streams.get(sample.stream).set(sample.seq, { key, sample });
      pending.set(key, sample);
      maxPending = Math.max(maxPending, pending.size);
      latest.set(`${key.split('/')[0]}/${sample.source}`, { key, sample });
    },
    observe(peer, kind, entry) {
      if (!Number.isSafeInteger(entry.sourceSeq)) {
        return;
      }
      const skipped = [];
      for (const [seq, prior] of streams.get(`${kind}/${entry.connectionId}`) ?? []) {
        if (seq >= entry.sourceSeq) {
          break;
        }
        const sample = prior.sample;
        if (sample.expected.has(peer.index) && !sample.seen.has(peer.index) && !sample.superseded.has(peer.index)) {
          sample.superseded.add(peer.index);
          superseded++;
          skipped.push(seq);
        }
        if (sample.seen.size + sample.superseded.size === sample.expected.size) {
          retire(prior.key, sample);
        }
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
      write({ phase: sample.phase, recipient: peer.index, kind, seq: entry.sourceSeq, source: sample.source, ms });
      all.add(ms);
      histogram(phases, sample.phase).add(ms);
      const client = clients.get(peer.index) ?? { all: new Histogram(), measured: new Histogram() };
      clients.set(peer.index, client);
      client.all.add(ms);
      if (sample.phase === 'measured') {
        client.measured.add(ms);
      }
      if (sample.seen.size + sample.superseded.size === sample.expected.size) {
        retire(key, sample);
      }
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
      return {
        motion: all.summary(),
        motionByPhase: Object.fromEntries(
          ['warmup', 'measured'].map((phase) => [phase, histogram(phases, phase).summary()])
        ),
        missingDeliveries: missing,
        supersededDeliveries: superseded,
        missingDeliveriesByPhase: Object.fromEntries(
          ['warmup', 'measured'].map((phase) => [phase, missingByPhase.get(phase) ?? 0])
        ),
        finalMotion: [...latest.values()].map(({ key, sample }) => ({
          key,
          missingRecipients: [...sample.expected].filter(
            (recipient) => !sample.seen.has(recipient) && !sample.superseded?.has(recipient)
          ),
        })),
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
    client(index) {
      const client = clients.get(index) ?? { all: new Histogram(), measured: new Histogram() };
      return {
        ...client.all.summary(),
        measured: client.measured.summary(),
        missingDeliveries: missingByClient.get(index) ?? 0,
      };
    },
  };
}
