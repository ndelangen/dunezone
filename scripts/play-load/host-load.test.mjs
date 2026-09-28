import { expect, test } from 'vitest';

import { hostLoad, idleShare } from './host-load.mjs';

const core = (idle, user) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });

test('idle share counts every core between two readings', () => {
  expect(idleShare([core(0, 0), core(0, 0)], [core(90, 10), core(10, 90)])).toBe(0.5);
  expect(idleShare([core(5, 5)], [core(5, 5)])).toBe(null);
  /* A core that came online between readings has no earlier reading, so it is left out. */
  expect(idleShare([core(0, 10)], [core(10, 10), core(50, 50)])).toBe(1);
});

test('a tick that runs late is recorded on the coordinator clock, and the CPU share is sampled', () => {
  let reading = 0;
  const cpus = () => [core(reading * 50, reading * 50)];
  const load = hostLoad({ now: () => 0, cpus, sampleEvery: 2 });
  load.tick(100);
  reading = 1;
  load.tick(200);
  load.tick(1300);
  const result = load.finish();
  expect(result.stalls).toEqual([{ atMs: 1300, lateMs: 1000 }]);
  expect(result.cpuIdle).toMatchObject({ samples: 1, p50: 0.5 });
});
