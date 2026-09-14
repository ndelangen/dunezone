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
    expect(timing.outstanding(new Set([0]))).toEqual([{ key: 'pose/source/1', missingRecipients: [1, 2] }]);
    expect(timing.outstanding(new Set([3]))).toEqual([]);
    const entry = { connectionId: 'source', sourceSeq: 1 };
    timing.observe({ index: 1 }, 'pose', entry);
    timing.observe({ index: 1 }, 'pose', entry);
    timing.observe({ index: 0 }, 'pose', entry);
    expect(timing.outstanding(new Set([0]))).toEqual([{ key: 'pose/source/1', missingRecipients: [2] }]);
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

test('a newer observed position supersedes unseen intermediate samples without hiding a missing final position', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'load-measurements-'));
  const timing = measurements(path.join(directory, 'observations.ndjson'), vi.fn());
  try {
    for (const seq of [1, 2, 3]) {
      timing.add(`pose/source/${seq}`, {
        phase: 'measured',
        at: performance.now(),
        source: 0,
        expected: new Set([1, 2]),
        seen: new Set(),
      });
    }
    timing.observe({ index: 1 }, 'pose', { connectionId: 'source', sourceSeq: 2 });
    timing.observe({ index: 2 }, 'pose', { connectionId: 'source', sourceSeq: 3 });
    expect(timing.outstanding(new Set([0]))).toEqual([{ key: 'pose/source/3', missingRecipients: [1] }]);
    const report = await timing.finish();
    expect(report.supersededDeliveries).toBe(3);
    expect(report.missingDeliveries).toBe(1);
    expect(report.finalMotion).toEqual([{ key: 'pose/source/3', missingRecipients: [1] }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('measured browser latency remains visible beside a faster protocol aggregate', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'load-measurements-'));
  vi.useFakeTimers({ toFake: ['performance'] });
  const timing = measurements(path.join(directory, 'observations.ndjson'), vi.fn());
  try {
    timing.add('pose/source/1', {
      phase: 'measured',
      at: 0,
      dispatchedAt: 5,
      source: 99,
      expected: new Set(Array.from({ length: 41 }, (_, index) => index)),
      seen: new Set(),
    });
    await vi.advanceTimersByTimeAsync(10);
    for (let index = 0; index < 40; index++) {
      timing.observe({ index, role: 'observer' }, 'pose', { connectionId: 'source', sourceSeq: 1 });
    }
    await vi.advanceTimersByTimeAsync(1000);
    timing.observe({ index: 40, role: 'observer', browser: true }, 'pose', { connectionId: 'source', sourceSeq: 1 });
    const report = await timing.finish();
    expect(report.motionByPhase.measured.p95).toBe(10);
    expect(report.motionByRecipientClass['browser-observer'].p95).toBe(1010);
    expect(timing.client(40).measured.p95).toBe(1010);
  } finally {
    vi.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  }
});
