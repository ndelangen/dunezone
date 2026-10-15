import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vite-plus/test';

import { saveCpuProfile, summarize } from './cpu.ts';

test('a long gap while the isolate yields does not outweigh more frequent execution samples', () => {
  const report = summarize({
    nodes: [
      { id: 1, callFrame: { functionName: 'send', url: 'index.js' } },
      { id: 2, callFrame: { functionName: 'commit', url: 'index.js' } },
    ],
    samples: [1, 2, 2],
    timeDeltas: [1_000_000, 1000, 1000],
    startTime: 0,
    endTime: 1_002_000,
  });
  expect(report.frames.map(({ functionName, samples }) => ({ functionName, samples }))).toEqual([
    { functionName: 'commit', samples: 2 },
    { functionName: 'send', samples: 1 },
  ]);
  expect(report.durationMs).toBe(1002);
  expect(report.medianSampleGapMs).toBe(1);
  expect(report.maxSampleGapMs).toBe(1000);
});

test('the saved CPU profile retains tree links and profiler metadata alongside its typed summary', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'load-cpu-profile-'));
  const profile = {
    nodes: [
      {
        id: 1,
        children: [2],
        hitCount: 0,
        deoptReason: 'not optimized',
        positionTicks: [{ line: 12, ticks: 1 }],
        callFrame: { functionName: '(root)', url: '', scriptId: '0', lineNumber: -1, columnNumber: -1 },
      },
      {
        id: 2,
        hitCount: 1,
        callFrame: {
          functionName: 'commit',
          url: 'index.js',
          scriptId: '99',
          lineNumber: 11,
          columnNumber: 3,
          nativeFrame: false,
        },
      },
    ],
    samples: [2],
    timeDeltas: [1000],
    startTime: 0,
    endTime: 1000,
    sampleMetadata: { engine: 'V8' },
  };
  try {
    const validated = await saveCpuProfile(directory, profile);
    const saved: unknown = JSON.parse(await readFile(path.join(directory, 'game.cpuprofile'), 'utf8'));
    expect(saved).toEqual(profile);
    const report = summarize(validated);
    expect(report.samples).toBe(1);
    expect(report.durationMs).toBe(1);
    expect(report.frames).toEqual([{ ...profile.nodes[1].callFrame, samples: 1 }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
