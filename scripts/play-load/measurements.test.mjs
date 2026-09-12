import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, vi } from 'vitest';

import { measurements } from './measurements.mjs';

test('timing records stream once per recipient and summaries retain missing deliveries', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'load-measurements-'));
  const filename = path.join(directory, 'observations.ndjson');
  const stop = vi.fn();
  const timing = measurements(filename, stop);
  try {
    timing.add('pose/source/1', {
      phase: 'measured',
      at: performance.now() - 10,
      source: 0,
      expected: new Set([1, 2]),
      seen: new Set(),
    });
    const entry = { connectionId: 'source', sourceSeq: 1 };
    timing.observe({ index: 1 }, 'pose', entry);
    timing.observe({ index: 1 }, 'pose', entry);
    timing.observe({ index: 0 }, 'pose', entry);
    const report = await timing.finish();
    expect(report.motion.samples).toBe(1);
    expect(report.motion.p50).toBeGreaterThanOrEqual(10);
    expect(report.missingDeliveries).toBe(1);
    expect(report.finalMotion).toEqual([{ key: 'pose/source/1', missingRecipients: [2] }]);
    expect(timing.client(1).measured.samples).toBe(1);
    expect(timing.client(2).missingDeliveries).toBe(1);
    const rows = (await readFile(filename, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient: 1, source: 0, seq: 1, kind: 'pose', phase: 'measured' });
    expect(stop).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('expired observations remain missing and keep their raw expiry evidence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'load-measurements-'));
  const filename = path.join(directory, 'observations.ndjson');
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const timing = measurements(filename, vi.fn());
  try {
    timing.add('pointer/source/1', {
      phase: 'warmup',
      at: performance.now() - 31_000,
      source: 0,
      expected: new Set([1]),
      seen: new Set(),
    });
    vi.advanceTimersByTime(1000);
    timing.observe({ index: 1 }, 'pointer', { connectionId: 'source', sourceSeq: 1 });
    const report = await timing.finish();
    expect(report.motion.samples).toBe(0);
    expect(report.observationStorage.expiredSamples).toBe(1);
    expect(report.missingDeliveriesByPhase.warmup).toBe(1);
    expect(JSON.parse((await readFile(filename, 'utf8')).trim())).toEqual({
      expired: 'pointer/source/1',
      missingRecipients: [1],
    });
  } finally {
    vi.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  }
});
