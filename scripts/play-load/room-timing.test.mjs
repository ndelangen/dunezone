import { expect, test } from 'vitest';

import { roomTiming } from './room-timing.mjs';

test('each command is split at the moment the room began handling it, and unmatched commands stay visible', () => {
  const sends = [
    { peer: 38, commandId: 'a', operation: 'rotate', phase: 'measured', sentAt: 1000, answeredAt: 1200 },
    { peer: 38, commandId: 'b', operation: 'flip', phase: 'measured', sentAt: 1500, answeredAt: 3200 },
    { peer: 38, commandId: 'c', operation: 'move', phase: 'measured', sentAt: 2000 },
  ];
  const timing = roomTiming(sends, [
    [
      { commandId: 'a', handledAt: 1090, durableAt: 1095 },
      { commandId: 'b', handledAt: 1590 },
    ],
  ]);
  /* The durable leg reads both ends from the room's clock, and a command whose write was not yet confirmed has none. */
  expect(timing.commands.map(({ durableMs }) => durableMs)).toEqual([5, null, null]);
  expect(timing.durableMs).toEqual({ samples: 1, min: 5, p50: 5, max: 5 });
  expect(timing.commands.map(({ toRoomMs, fromRoomMs }) => [toRoomMs, fromRoomMs])).toEqual([
    [90, 110],
    [90, 1610],
    [null, null],
  ]);
  expect(timing.fromRoomMs).toEqual({ samples: 2, min: 110, p50: 110, max: 1610 });
  expect(roomTiming(sends.slice(0, 1), [[{ commandId: 'a', handledAt: 900 }]]).toRoomMs).toEqual({
    samples: 1,
    min: -100,
    p50: -100,
    max: -100,
  });
  expect(timing.unmatched).toBe(1);
});

test('a replayed command keeps the handling that answered its send', () => {
  const sends = [
    { peer: 1, commandId: 'a', operation: 'rotate', phase: 'preparation', sentAt: 1000, answeredAt: 1200 },
  ];
  const timing = roomTiming(sends, [[{ commandId: 'a', handledAt: 1090 }], [{ commandId: 'a', handledAt: 5000 }]]);
  expect(timing.commands[0]).toMatchObject({ handledAt: 1090, toRoomMs: 90, fromRoomMs: 110 });
});
