import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

import { distribution } from './measurements.mjs';

/** The share of CPU time all cores spent idle between two `os.cpus()` readings. */
export function idleShare(before, after) {
  let idle = 0;
  let total = 0;
  for (const [index, core] of after.entries()) {
    const previous = before[index]?.times;
    if (!previous) {
      continue;
    }
    for (const [kind, value] of Object.entries(core.times)) {
      const spent = value - previous[kind];
      total += spent;
      if (kind === 'idle') {
        idle += spent;
      }
    }
  }
  return total > 0 ? idle / total : null;
}

/** Reads how idle this machine is over one window, so a run can say it started on a busy machine. */
export async function measureIdle(windowMs = 1000, cpus = os.cpus) {
  const before = cpus();
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  return idleShare(before, cpus());
}

/**
 * Watches the coordinator process while it runs, on the same performance.now clock as every send and receive.
 * A late tick means this process could not run, so a delivery stall at the same moment was the client's, not the room's.
 */
export function hostLoad({
  now = () => performance.now(),
  cpus = os.cpus,
  tickMs = 100,
  stallMs = 250,
  limit = 64,
  sampleEvery = 10,
} = {}) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  const stalls = [];
  const idle = [];
  let dropped = 0;
  let ticks = 0;
  let last = now();
  let reading = cpus();
  delay.enable();
  const timer = setInterval(() => {
    tick(now());
  }, tickMs).unref();
  function tick(at) {
    const lateMs = at - last - tickMs;
    last = at;
    if (lateMs > stallMs) {
      if (stalls.length < limit) {
        stalls.push({ atMs: Math.round(at), lateMs: Math.round(lateMs) });
      } else {
        dropped++;
      }
    }
    if (++ticks % sampleEvery === 0) {
      const next = cpus();
      const share = idleShare(reading, next);
      reading = next;
      if (share !== null) {
        idle.push(share);
      }
    }
  }
  return {
    tick,
    finish() {
      clearInterval(timer);
      delay.disable();
      const ms = (value) => Math.round(value / 1e4) / 100;
      return {
        eventLoopDelayMs: delay.count
          ? { p50: ms(delay.percentile(50)), p99: ms(delay.percentile(99)), max: ms(delay.max) }
          : null,
        stalls,
        droppedStalls: dropped,
        cpuIdle: distribution(idle),
        limitation:
          'The coordinator process and the machine it runs on. Stalls are ticks over 250 ms late; CPU idle is the share of all cores, sampled once a second. Browsers run in their own processes and only show here through the machine share.',
      };
    },
  };
}
