import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

import { distribution } from './measurements.mjs';

const spent = (times) => Object.values(times).reduce((sum, value) => sum + value, 0);

/** The share of CPU time all cores spent idle between two `os.cpus()` readings. */
export function idleShare(before, after) {
  const cores = after.map((core, index) => [before[index]?.times, core.times]).filter(([previous]) => previous);
  const idle = cores.reduce((sum, [previous, current]) => sum + current.idle - previous.idle, 0);
  const total = cores.reduce((sum, [previous, current]) => sum + spent(current) - spent(previous), 0);
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
  function recordStall(at, lateMs) {
    if (stalls.length < limit) {
      stalls.push({ atMs: Math.round(at), lateMs: Math.round(lateMs) });
    } else {
      dropped++;
    }
  }
  function sampleIdle() {
    const next = cpus();
    const share = idleShare(reading, next);
    reading = next;
    if (share !== null) {
      idle.push(share);
    }
  }
  function tick(at) {
    const lateMs = at - last - tickMs;
    last = at;
    if (lateMs > stallMs) {
      recordStall(at, lateMs);
    }
    if (++ticks % sampleEvery === 0) {
      sampleIdle();
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
        limitation: `The coordinator process and the machine it runs on. Stalls are ${tickMs} ms ticks over ${stallMs} ms late; event-loop delay includes its 10 ms sampling interval, so an idle process reads about 10 ms; CPU idle is the share of all cores, sampled every ${(tickMs * sampleEvery) / 1000} s. Browsers run in their own processes and only show here through the machine share.`,
      };
    },
  };
}
