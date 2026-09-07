import { describe, expect, test } from 'vitest';

import { TransientError, retryTransient } from './retry-transient';

type Outcome = 'transient' | 'finding' | 'ok';

function harness(outcomes: Outcome[]) {
  const log: string[] = [];
  const slept: number[] = [];
  let calls = 0;
  const attempt = () => {
    const outcome = outcomes[calls];
    calls += 1;
    if (outcome === 'transient') {
      throw new TransientError('ECONNRESET');
    }
    if (outcome === 'finding') {
      throw new Error('drift found');
    }
    return 'answer';
  };
  const run = () =>
    retryTransient(attempt, {
      subject: 'the endpoint',
      delaysMs: [1000, 3000],
      sleep: async (ms) => {
        slept.push(ms);
      },
      log: (line) => log.push(line),
    });
  return { run, log, slept, calls: () => calls };
}

describe('retryTransient', () => {
  test('returns the answer of the first attempt that succeeds, after the stated pauses', async () => {
    const h = harness(['transient', 'transient', 'ok']);
    await expect(h.run()).resolves.toBe('answer');
    expect(h.calls()).toBe(3);
    expect(h.slept).toEqual([1000, 3000]);
    expect(h.log).toEqual([
      'the endpoint: attempt 1 of 3 failed (ECONNRESET); retrying in 1 s',
      'the endpoint: attempt 2 of 3 failed (ECONNRESET); retrying in 3 s',
    ]);
  });

  test('refuses after the last attempt with the subject, the count and the last failure named', async () => {
    const h = harness(['transient', 'transient', 'transient']);
    await expect(h.run()).rejects.toThrow('the endpoint unreachable after 3 attempts; last: ECONNRESET');
    expect(h.calls()).toBe(3);
    expect(h.slept).toEqual([1000, 3000]);
  });

  test('rethrows a finding from the attempt that raised it without a retry', async () => {
    const h = harness(['finding', 'ok']);
    await expect(h.run()).rejects.toThrow('drift found');
    expect(h.calls()).toBe(1);
    expect(h.slept).toEqual([]);
    expect(h.log).toEqual([]);
  });
});
