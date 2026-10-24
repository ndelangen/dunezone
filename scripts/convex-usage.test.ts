import { expect, test } from 'vite-plus/test';

import { assessUsage, summarizeFunctions, usageMarkdown } from './convex-usage';
import type { DeploymentUsage, UsageBaseline } from './convex-usage';

const now = '2026-10-24T06:23:00.000Z';
const yesterday = '2026-10-23T06:23:00.000Z';
function deployment(name: string, io: number, calls = 100): DeploymentUsage {
  const usage = (current_month: number) => ({ usage: { current_day: 0, current_month } });
  return {
    name,
    kind: name === 'production' ? 'prod' : 'dev',
    capturedAt: now,
    usage: { seedStatus: 'complete', metrics: { databaseIoGb: usage(io), functionCalls: usage(calls) } },
    sample: { from: null, to: null, events: 0, functions: [] },
  };
}
const deployments = (prod: number, dev: number) => ({
  production: deployment('production', prod),
  development: deployment('development', dev),
});
const baseline = (prod: number, dev: number, activeAlerts: string[] = []): UsageBaseline => ({
  capturedAt: yesterday,
  deployments: deployments(prod, dev),
  activeAlerts,
});

test('separates prod and dev growth and notifies only on new crossings', () => {
  const first = assessUsage(deployments(0.6, 0.2), baseline(0.59, 0.19), now);
  expect(first.newAlerts).toEqual(['calendar-0.75']);
  expect(first.growth.production?.ioGb).toBeCloseTo(0.01);
  expect(first.growth.development?.ioGb).toBeCloseTo(0.01);
  const repeated = assessUsage(deployments(0.6, 0.2), { ...first, capturedAt: yesterday }, now);
  expect(repeated.newAlerts).toEqual([]);
  const escalation = assessUsage(deployments(0.7, 0.25), baseline(0.69, 0.24, first.activeAlerts), now);
  expect(escalation.newAlerts).toEqual(['calendar-0.9']);
});

test('daily bursts identify the deployment and normalize an irregular observation interval', () => {
  const report = assessUsage(deployments(0.3, 0.05), baseline(0.19, 0.04), now);
  expect(report.newAlerts).toContain('daily-production');
  expect(report.newAlerts).not.toContain('daily-development');
  const longer = assessUsage(
    deployments(0.3, 0.05),
    { ...baseline(0.19, 0.04), capturedAt: '2026-10-22T06:23:00.000Z' },
    now
  );
  expect(longer.newAlerts).not.toContain('daily-production');
});

test('first capture, month rollover, replaced deployment and reset counters do not invent daily growth', () => {
  expect(assessUsage(deployments(0.1, 0.1), undefined, now).growth.production).toBeNull();
  expect(
    assessUsage(deployments(0.1, 0.1), { ...baseline(0.01, 0.01), capturedAt: '2026-09-30T06:23:00.000Z' }, now).growth
      .production
  ).toBeNull();
  const replaced = baseline(0.01, 0.01);
  replaced.deployments.production.name = 'old-production';
  expect(assessUsage(deployments(0.1, 0.1), replaced, now).growth.production).toBeNull();
  expect(assessUsage(deployments(0.1, 0.1), baseline(0.2, 0.2), now).growth.production).toBeNull();
});

test('function samples discard private log text, deduplicate executions and retain component attribution', () => {
  const event = {
    kind: 'Completion',
    timestamp: Date.parse(now) / 1000,
    executionId: 'one',
    identifier: 'rulesets:detailPage',
    componentPath: null,
    usageStats: { databaseIoReadBytes: 1024, databaseIoWriteBytes: 0 },
    logLines: ['PRIVATE USER DATA'],
    args: 'secret',
  };
  const sample = summarizeFunctions(
    [
      event,
      event,
      {
        ...event,
        executionId: 'two',
        componentPath: 'catalogueOrder',
        usageStats: { databaseIoReadBytes: 2, databaseIoWriteBytes: 3 },
      },
      { ...event, executionId: 'old', timestamp: event.timestamp - 86_401 },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
    Date.parse(now)
  );
  expect(sample.events).toBe(2);
  expect(sample.functions).toEqual([
    { name: 'rulesets:detailPage', calls: 1, readBytes: 1024, writeBytes: 0 },
    { name: 'catalogueOrder/rulesets:detailPage', calls: 1, readBytes: 2, writeBytes: 3 },
  ]);
  expect(JSON.stringify(sample)).not.toContain('PRIVATE');
  expect(JSON.stringify(sample)).not.toContain('secret');
});

test('reports distinguish calendar totals, sampled functions and unavailable baselines', () => {
  const report = assessUsage(deployments(0.6, 0.2), undefined, now);
  const markdown = usageMarkdown(report);
  expect(markdown).toContain('not the dashboard billing window');
  expect(markdown).toContain('No comparable baseline');
  expect(markdown).toContain('sample, not daily totals');
  expect(markdown).toContain('production: production');
  expect(markdown).toContain('development: development');
});

test('swapped or duplicated deployment credentials cannot produce a combined report', () => {
  const wrong = deployments(0.1, 0.1);
  wrong.development.kind = 'prod';
  expect(() => assessUsage(wrong, undefined, now)).toThrow(/distinct production and development/);
});

test('a new calendar month starts a new threshold alert history', () => {
  const previous = { ...baseline(0.6, 0.2, ['calendar-0.75']), capturedAt: '2026-09-30T06:23:00.000Z' };
  expect(assessUsage(deployments(0.6, 0.2), previous, now).newAlerts).toEqual(['calendar-0.75']);
});
