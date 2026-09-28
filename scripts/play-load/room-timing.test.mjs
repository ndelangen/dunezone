import { expect, test } from 'vitest';

import { roomTiming } from './room-timing.mjs';

test('each command is split at the moment the room began handling it, and unmatched commands stay visible', () => {
  const sends = [
    { peer: 38, commandId: 'a', operation: 'rotate', phase: 'measured', sentAt: 1000, answeredAt: 1200 },
    { peer: 38, commandId: 'b', operation: 'flip', phase: 'measured', sentAt: 1500, answeredAt: 3200 },
    { peer: 38, commandId: 'c', operation: 'move', phase: 'measured', sentAt: 2000 },
  ];
  const timing = roomTiming(
    sends,
    new Map([
      ['a', 1090],
      ['b', 1590],
    ])
  );
  expect(timing.commands.map(({ toRoomMs, fromRoomMs }) => [toRoomMs, fromRoomMs])).toEqual([
    [90, 110],
    [90, 1610],
    [null, null],
  ]);
  expect(timing.fromRoomMs).toEqual({ samples: 2, min: 110, p50: 110, max: 1610 });
  expect(roomTiming(sends.slice(0, 1), new Map([['a', 900]])).toRoomMs).toEqual({
    samples: 1,
    min: -100,
    p50: -100,
    max: -100,
  });
  expect(timing.unmatched).toBe(1);
});
