import { afterEach, expect, test, vi } from 'vite-plus/test';

import { ROOM_SUMMARY_MS, RoomSummary } from './roomSummary';
import type { RoomCounters } from './roomSummary';

afterEach(() => {
  vi.restoreAllMocks();
});

const counters = (overrides: Partial<RoomCounters> = {}): RoomCounters => ({
  motionReceived: 0,
  motionForwarded: 0,
  motionDropped: 0,
  activityDeliveries: 0,
  messagesSent: 0,
  bytesSent: 0,
  ...overrides,
});

const telemetry = (p95Ms: number, maxMs: number, longTaskMs = 0) => ({
  actions: { count: 4, p50Ms: 40, p95Ms, maxMs },
  longTasks: { count: longTaskMs ? 1 : 0, worstMs: longTaskMs },
});

test('a summary reports what changed since the last one, with the room identity and no player data', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const summary = new RoomSummary(() => ({ roomId: 'room-a', gitSha: 'revision' }), 0);
  summary.connections(3);
  summary.connections(2);
  for (const durableMs of [10, 20, 30, 400]) {
    summary.message();
    summary.command(durableMs);
  }
  summary.stall(300);
  summary.stall(900);
  summary.convexCall({ path: 'playAdmission:reconcileAccounts', durationMs: 40, ok: true });
  summary.convexCall({ path: 'playAdmission:reconcileAccounts', durationMs: 120, ok: false });
  summary.client('connection-a', telemetry(90, 200));
  summary.client('connection-b', telemetry(60, 80, 120));
  summary.client('connection-b', telemetry(70, 300, 150));

  expect(summary.due(ROOM_SUMMARY_MS - 1)).toBe(false);
  expect(summary.due(ROOM_SUMMARY_MS)).toBe(true);
  expect(
    summary.flush(counters({ messagesSent: 50, bytesSent: 5000, motionDropped: 2 }), 2, 'interval', ROOM_SUMMARY_MS)
  ).toBe(true);
  expect(log).toHaveBeenCalledWith({
    event: 'game-room-summary',
    roomId: 'room-a',
    gitSha: 'revision',
    reason: 'interval',
    intervalMs: ROOM_SUMMARY_MS,
    connections: 2,
    peakConnections: 3,
    messagesIn: 4,
    motionReceived: 0,
    motionForwarded: 0,
    motionDropped: 2,
    activityDeliveries: 0,
    messagesSent: 50,
    bytesSent: 5000,
    commands: { count: 4, p50Ms: 30, p95Ms: 400, maxMs: 400 },
    stalls: 2,
    worstStallMs: 900,
    convex: { 'playAdmission:reconcileAccounts': { calls: 2, failures: 1, totalMs: 160, maxMs: 120 } },
    clients: {
      reports: 2,
      worstActionP95Ms: 90,
      worstActionMaxMs: 300,
      actions: 8,
      longTasks: 1,
      worstLongTaskMs: 150,
    },
  });

  log.mockClear();
  summary.message();
  summary.flush(counters({ messagesSent: 53, bytesSent: 5600, motionDropped: 2 }), 0, 'empty', ROOM_SUMMARY_MS + 5000);
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: 'empty',
      intervalMs: 5000,
      peakConnections: 2,
      messagesIn: 1,
      messagesSent: 3,
      bytesSent: 600,
      motionDropped: 0,
      commands: { count: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 },
      convex: {},
      clients: expect.objectContaining({ reports: 0, worstActionP95Ms: 0 }),
    })
  );
});

test('a quiet interval writes nothing and still starts the next one', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const summary = new RoomSummary(() => ({}), 0);
  expect(summary.flush(counters({ messagesSent: 7 }), 0, 'interval', ROOM_SUMMARY_MS)).toBe(true);
  expect(summary.flush(counters({ messagesSent: 7 }), 0, 'interval', 2 * ROOM_SUMMARY_MS)).toBe(false);
  expect(log).toHaveBeenCalledTimes(1);
  expect(summary.due(2 * ROOM_SUMMARY_MS + 1)).toBe(false);
});

test('the command count and maximum cover every command, beyond the kept timings', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const summary = new RoomSummary(() => ({}), 0);
  summary.command(5000);
  for (let index = 0; index < 3000; index++) {
    summary.message();
    summary.command(10);
  }
  summary.flush(counters(), 1, 'interval', ROOM_SUMMARY_MS);
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ commands: { count: 3001, p50Ms: 10, p95Ms: 10, maxMs: 5000 } })
  );
});
