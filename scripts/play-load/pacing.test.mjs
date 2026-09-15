import { afterEach, expect, test, vi } from 'vitest';

import { runActionSchedule } from './pacing.mjs';

afterEach(() => vi.useRealTimers());

test('slow ordered actions leave every scheduled intent visible without overlapping or catching up', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const slots = [];
  let active = 0;
  let maximum = 0;
  const work = runActionSchedule({
    startedAt: performance.now(),
    durationMs: 30_000,
    rate: 2,
    stopping: () => false,
    onSlot: (slot) => slots.push(slot),
    step: async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 650));
      active--;
    },
  });
  await vi.advanceTimersByTimeAsync(31_000);
  expect(await work).toMatchObject({ status: 'failed', scheduled: 60, dispatched: 30, skipped: 30, maxInFlight: 1 });
  expect(slots).toHaveLength(60);
  expect(slots.filter((slot) => slot.status === 'dispatched')).toHaveLength(30);
  expect(slots.filter((slot) => slot.reason === 'prior-interaction-in-flight')).toHaveLength(30);
  expect(maximum).toBe(1);
  expect(slots.map((slot) => slot.scheduledAt)).toEqual(Array.from({ length: 60 }, (_, index) => index * 500));
});

test('responsive ordered actions sustain the full offered rate', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const slots = [];
  const work = runActionSchedule({
    startedAt: 0,
    durationMs: 30_000,
    rate: 2,
    stopping: () => false,
    onSlot: (slot) => slots.push(slot),
    step: () => new Promise((resolve) => setTimeout(resolve, 100)),
  });
  await vi.advanceTimersByTimeAsync(31_000);
  expect(await work).toMatchObject({ status: 'complete', scheduled: 60, dispatched: 60, skipped: 0 });
  expect(slots.every((slot) => slot.dispatchedAt === slot.scheduledAt)).toBe(true);
});

test('a coordinator pause never causes a catch-up burst', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const now = performance.now.bind(performance);
  let offset = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now() + offset);
  const slots = [];
  const work = runActionSchedule({
    startedAt: 0,
    durationMs: 3000,
    rate: 2,
    stopping: () => false,
    onSlot: (slot) => slots.push(slot),
    step: async () => {
      offset = 1200;
    },
  });
  await vi.advanceTimersByTimeAsync(4000);
  expect(await work).toMatchObject({ status: 'failed', scheduled: 6 });
  expect(slots.some((slot) => slot.reason === 'coordinator-late')).toBe(true);
  const dispatched = slots.filter((slot) => slot.status === 'dispatched');
  for (let index = 1; index < dispatched.length; index++) {
    expect(dispatched[index].dispatchedAt - dispatched[index - 1].dispatchedAt).toBeGreaterThanOrEqual(499);
  }
  vi.restoreAllMocks();
});

test('a stop retains the unoffered remainder as incomplete', async () => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  const slots = [];
  let stopped = false;
  const work = runActionSchedule({
    startedAt: 0,
    durationMs: 3000,
    rate: 2,
    stopping: () => stopped,
    onSlot: (slot) => slots.push(slot),
    step: async () => {
      stopped = true;
    },
  });
  await vi.advanceTimersByTimeAsync(4000);
  expect(await work).toMatchObject({ status: 'incomplete', scheduled: 6, dispatched: 1, skipped: 5 });
  expect(slots.filter((slot) => slot.reason === 'stopped')).toHaveLength(5);
});
