import { expect, test } from 'vite-plus/test';

import { describe, JsonStream, playRecords } from './lib/play-watch';

const tailEvent = (message: unknown[], timestamp = 1_760_000_000_000) => ({
  outcome: 'ok',
  logs: [{ message, level: 'info', timestamp }],
});

test('pretty-printed tail events split across chunks come out whole, and banner text is skipped', () => {
  const stream = new JsonStream();
  const text = `Successfully created tail\n${JSON.stringify(tailEvent([{ event: 'game-room-summary', note: 'a "}" inside' }]), null, 2)}\n${JSON.stringify(tailEvent(['plain']))}`;
  /* Seven-character chunks cut the objects, their strings and the banner at arbitrary points. */
  const values = Array.from({ length: Math.ceil(text.length / 7) }, (_, index) =>
    text.slice(index * 7, index * 7 + 7)
  ).flatMap((chunk) => stream.push(chunk));
  expect(values).toHaveLength(2);
  expect(playRecords(values[0])).toEqual([{ event: 'game-room-summary', note: 'a "}" inside', at: 1_760_000_000_000 }]);
  expect(playRecords(values[1])).toEqual([]);
});

test('only Play records are kept, and each reads as one line with failures marked', () => {
  const records = playRecords({
    logs: [
      {
        message: [
          {
            event: 'game-operation-failed',
            roomId: 'abcdef1234',
            operation: 'directory',
            failureCategory: 'timeout',
            suppressed: 2,
          },
        ],
        timestamp: 0,
      },
      { message: [{ event: 'something-else' }], timestamp: 0 },
      { message: ['text'], timestamp: 0 },
    ],
  });
  expect(records).toHaveLength(1);
  expect(describe(records[0]!)).toBe('00:00:00 ALERT room abcdef12: directory failed (timeout), 2 suppressed');
  expect(
    describe({
      event: 'game-room-summary',
      at: 0,
      roomId: 'abcdef1234',
      reason: 'interval',
      peakConnections: 6,
      commands: { count: 40, p95Ms: 120, maxMs: 300 },
      clients: { worstActionP95Ms: 180, worstLongTaskMs: 90 },
      stalls: 0,
      motionDropped: 0,
      convex: { a: { calls: 7 }, b: { calls: 3 } },
    })
  ).toBe(
    "00:00:00 room abcdef12 interval: 6 peak, 40 saves (p95 120 ms, max 300 ms), players' p95 180 ms, long task 90 ms, 0 stalls, 0 motion dropped, 10 Convex calls"
  );
});
