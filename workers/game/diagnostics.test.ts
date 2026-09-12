import { afterEach, expect, test, vi } from 'vitest';

import { GameDiagnostics } from './diagnostics';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('repeated failures are bounded per operation and room, with the skipped count on the next report', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const room = new GameDiagnostics('room-a', 'revision');
  for (let index = 0; index < 10_000; index++) {
    room.report('message', new Error('failure'));
  }
  expect(log).toHaveBeenCalledTimes(1);
  room.report('confirmation');
  new GameDiagnostics('room-b', 'revision').report('message');
  expect(log).toHaveBeenCalledTimes(3);
  vi.setSystemTime(60_999);
  room.report('message');
  expect(log).toHaveBeenCalledTimes(3);
  vi.setSystemTime(61_000);
  room.report('message');
  expect(log).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'message',
      roomId: 'room-a',
      suppressed: 10_000,
      since: 1000,
    })
  );
});

test('diagnostics retain a safe failure category without exception content or credentials', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new TypeError('secret ticket and player content', { cause: 'private backend response' });
  error.name = 'private account';
  error.stack = 'private stack';
  new GameDiagnostics('room-a', 'revision').report('message', error);
  expect(log).toHaveBeenCalledWith({
    event: 'game-operation-failed',
    operation: 'message',
    roomId: 'room-a',
    gitSha: 'revision',
    errorKind: 'TypeError',
    suppressed: 0,
    since: expect.any(Number),
  });
});
