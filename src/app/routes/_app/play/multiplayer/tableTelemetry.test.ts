import { expect, test } from 'vite-plus/test';

import { TableTelemetry } from './tableTelemetry';

test("a report holds the round trips of this page's own receipts and its long tasks, then starts over", () => {
  let now = 0;
  const telemetry = new TableTelemetry(() => now);
  expect(telemetry.report()).toBeNull();

  for (const [id, tripMs] of [
    ['a', 40],
    ['b', 60],
    ['c', 500],
  ] as const) {
    telemetry.sent(id);
    now += tripMs;
    telemetry.completed(id);
  }
  telemetry.sent('rejected');
  telemetry.rejected('rejected');
  now += 10_000;
  telemetry.completed('rejected');
  telemetry.completed('another-page');
  telemetry.completed(undefined);
  telemetry.longTask(80.4);
  telemetry.longTask(240.6);

  expect(telemetry.report()).toEqual({
    type: 'telemetry',
    actions: { count: 3, p50Ms: 60, p95Ms: 500, maxMs: 500 },
    longTasks: { count: 2, worstMs: 241 },
  });
  expect(telemetry.report()).toBeNull();
});

test('a command never answered is forgotten once the page has sent enough newer ones', () => {
  let now = 0;
  const telemetry = new TableTelemetry(() => now);
  telemetry.sent('lost');
  for (let index = 0; index < 64; index++) {
    telemetry.sent(`command-${index}`);
  }
  now = 30;
  telemetry.completed('lost');
  telemetry.completed('command-63');
  expect(telemetry.report()?.actions).toEqual({ count: 1, p50Ms: 30, p95Ms: 30, maxMs: 30 });
});
