import { expect, test } from 'vitest';

import { summarize } from './cpu.mjs';

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
