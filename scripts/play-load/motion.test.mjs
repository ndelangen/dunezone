import { afterEach, expect, test, vi } from 'vitest';

import { runMotionSchedule } from './motion.mjs';

afterEach(() => vi.useRealTimers());

test('a failed rotation accounts for the rest of the fixed motion schedule', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const work = runMotionSchedule({
    startedAt: 0,
    durationMs: 30_000,
    warmupMs: 0,
    rate: 20,
    rotationMs: 10_000,
    players: Array.from({ length: 18 }, (_, index) => ({ index })),
    moverCount: 6,
    rotate: async () => {
      throw new Error('Carry admission rejected');
    },
    transmit: () => true,
    stopping: () => false,
  });
  await vi.advanceTimersByTimeAsync(31_000);
  const report = await work;
  expect(report).toMatchObject({
    status: 'failed',
    failure: 'Carry admission rejected',
    totals: { scheduled: 7200, transmitted: 2400, pending: 0, skippedFailure: 4800 },
    coordinatorLateness: { samples: 200 },
    achievedHzPerActiveSource: 20 / 3,
  });
});

test('rotation delays stay separate from coordinator coalescing and preserve source groups', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const sent = [];
  const work = runMotionSchedule({
    startedAt: 0,
    durationMs: 30_000,
    warmupMs: 10_000,
    rate: 20,
    rotationMs: 10_000,
    players: Array.from({ length: 18 }, (_, index) => ({ index })),
    moverCount: 6,
    rotate: () => new Promise((resolve) => setTimeout(resolve, 200)),
    transmit: (input) => {
      sent.push(input);
      return true;
    },
    stopping: () => false,
  });
  await vi.advanceTimersByTimeAsync(31_000);
  const report = await work;
  expect(report.totals).toMatchObject({
    scheduled: 7200,
    transmitted: 7104,
    pending: 0,
    skippedRotation: 96,
    coalesced: 0,
  });
  expect(report.byPhase.warmup.pointer.transmitted).toBe(1200);
  expect(
    sent
      .filter((input) => input.seq >= 200 && input.seq < 400)
      .every((input) => input.peer.index >= 6 && input.peer.index < 12)
  ).toBe(true);
});

test('stopping between pointer and pose records their different achieved rates', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  let stopped = false;
  const work = runMotionSchedule({
    startedAt: 0,
    durationMs: 1000,
    warmupMs: 0,
    rate: 20,
    rotationMs: 10_000,
    players: [{ index: 0 }],
    moverCount: 1,
    rotate: async () => {},
    transmit: () => {
      if (stopped) {
        return false;
      }
      stopped = true;
      return true;
    },
    stopping: () => stopped,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(await work).toMatchObject({
    status: 'incomplete',
    totals: { scheduled: 40, transmitted: 1, skippedStop: 39, pending: 0 },
    pointerHz: 1,
    poseHz: 0,
  });
});

test('a transmission error without a message still fails and accounts for every input', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const work = runMotionSchedule({
    startedAt: 0,
    durationMs: 1000,
    warmupMs: 0,
    rate: 20,
    rotationMs: 10_000,
    players: [{ index: 0 }],
    moverCount: 1,
    rotate: async () => {},
    transmit: () => {
      throw new Error();
    },
    stopping: () => false,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(await work).toMatchObject({
    status: 'failed',
    failure: expect.stringMatching(/\S/),
    totals: { scheduled: 40, transmitted: 0, skippedFailure: 40, pending: 0 },
  });
});
