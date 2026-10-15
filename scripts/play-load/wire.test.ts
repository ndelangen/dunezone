import { expect, test } from 'vitest';

import { readServerMessage } from './wire.ts';

test('measured frames retain the Worker clock and extra wire fields', () => {
  const frame = {
    type: 'metrics',
    revision: 1,
    historySteps: 0,
    receiptCount: 0,
    motionReceived: 2,
    motionForwarded: 2,
    messagesSent: 3,
    bytesSent: 120,
    serverNow: 1000,
    diagnostics: { observedAt: 999 },
  };
  expect(readServerMessage(JSON.stringify(frame))).toEqual(frame);
});

test.each([null, [], {}, { type: 1 }, { type: 'unrecognized' }])('a frame needs a recognized envelope: %j', (frame) => {
  expect(() => readServerMessage(JSON.stringify(frame))).toThrow();
});
