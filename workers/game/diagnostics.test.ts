import { afterEach, expect, test, vi } from 'vitest';

import { DependencyFailure, GameDiagnostics } from './diagnostics';

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
  expect(room.summary()).toEqual({ message: 10_002, confirmation: 1 });
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
    failureCategory: 'exception',
    uptimeMs: expect.any(Number),
    suppressed: 0,
    since: expect.any(Number),
  });
});

test('only explicit operation recovery ends an outage; resolving a handler is not recovery', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const recovered = vi.spyOn(console, 'info').mockImplementation(() => {});
  const room = new GameDiagnostics('room', 'sha', () => ({
    roomClass: 'HomepageRoom',
    revision: 4,
    connections: 2,
    workerVersionId: 'version',
  }));
  const error = new DependencyFailure('private response', { failureCategory: 'http', httpStatus: 503, durationMs: 14 });
  await expect(
    room.run('admission', async () => {
      throw error;
    })
  ).rejects.toBe(error);
  room.report('admission', error);
  vi.setSystemTime(2000);
  await expect(room.run('admission', async () => 42)).resolves.toBe(42);
  expect(recovered).not.toHaveBeenCalled();
  room.recovered('admission');
  room.recovered('admission');
  await room.run('admission', async () => 42);
  expect(recovered).toHaveBeenCalledExactlyOnceWith({
    event: 'game-operation-recovered',
    operation: 'admission',
    roomId: 'room',
    gitSha: 'sha',
    roomClass: 'HomepageRoom',
    revision: 4,
    connections: 2,
    workerVersionId: 'version',
    uptimeMs: 1000,
    failures: 2,
    outageMs: 1000,
  });
});

test('alternating failures and recoveries cannot bypass either log limit', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recovered = vi.spyOn(console, 'info').mockImplementation(() => {});
  const room = new GameDiagnostics('room', 'sha');
  for (let i = 0; i < 10_000; i++) {
    room.report('admission');
    room.recovered('admission');
  }
  expect(failed).toHaveBeenCalledTimes(1);
  expect(recovered).toHaveBeenCalledTimes(1);
  vi.setSystemTime(60_000);
  room.report('admission');
  room.recovered('admission');
  expect(failed).toHaveBeenCalledTimes(2);
  expect(recovered).toHaveBeenCalledTimes(2);
});

test('only the fixed storage-reset reference and boolean runtime flags survive', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(
    new Error('Internal error in Durable Object storage caused object to be reset; reference = abc123'),
    {
      retryable: true,
      overloaded: false,
      remote: 'private value',
      cause: new Error('private secret'),
    }
  );
  new GameDiagnostics('room', 'sha').report('refresh', error);
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({
      failureCategory: 'storage-reset',
      storageReference: 'abc123',
      retryable: true,
      overloaded: false,
    })
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  error.message += ' private';
  new GameDiagnostics('room', 'sha').report('refresh', error);
  expect(log.mock.lastCall?.[0]).not.toHaveProperty('storageReference');
});
