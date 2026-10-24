import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { z } from 'zod';

import { convexUsage } from './play-load/provider-usage';
import type { UsageExec } from './play-load/provider-usage';

const counter = z.number().finite().nonnegative();
const metric = z.object({ usage: z.object({ current_day: counter, current_month: counter }) });
const usageSchema = z.object({
  seedStatus: z.literal('complete'),
  metrics: z.object({ databaseIoGb: metric, functionCalls: metric }),
});
const functionSchema = z.object({ name: z.string(), calls: counter, readBytes: counter, writeBytes: counter });
const deploymentSchema = z.object({
  kind: z.enum(['prod', 'dev']),
  name: z.string().regex(/^[a-z0-9-]+$/),
  capturedAt: z.iso.datetime(),
  usage: usageSchema,
  sample: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
    events: counter,
    functions: z.array(functionSchema),
  }),
});
export type DeploymentUsage = z.infer<typeof deploymentSchema>;
const reportSchema = z.object({
  capturedAt: z.iso.datetime(),
  deployments: z.object({ production: deploymentSchema, development: deploymentSchema }),
  activeAlerts: z.array(z.string()),
});
export type UsageBaseline = z.infer<typeof reportSchema>;

const completionSchema = z.object({
  kind: z.literal('Completion'),
  timestamp: counter,
  executionId: z.string(),
  identifier: z.string().regex(/^[\w/.: -]{1,120}$/),
  componentPath: z
    .string()
    .regex(/^[\w/.: -]{1,120}$/)
    .nullable()
    .optional(),
  usageStats: z
    .object({
      databaseIoReadBytes: counter.catch(0),
      databaseIoWriteBytes: counter.catch(0),
    })
    .default({ databaseIoReadBytes: 0, databaseIoWriteBytes: 0 }),
});

function recentCompletion(line: string, now: number) {
  try {
    const result = completionSchema.safeParse(JSON.parse(line));
    if (!result.success) {
      return null;
    }
    const event = result.data;
    return event.timestamp >= now / 1000 - 86_400 && event.timestamp <= now / 1000 ? event : null;
  } catch {
    return null;
  }
}

/** Only counters and function names leave the log reader; application log text and arguments are discarded. */
export function summarizeFunctions(jsonl: string, now: number) {
  const functions = new Map<string, z.infer<typeof functionSchema>>();
  const seen = new Set<string>();
  const timestamps: number[] = [];
  for (const line of jsonl.trim().split('\n').slice(-1000)) {
    const event = recentCompletion(line, now);
    if (!event || seen.has(event.executionId)) {
      continue;
    }
    seen.add(event.executionId);
    const name = [event.componentPath, event.identifier].filter(Boolean).join('/');
    const readBytes = event.usageStats.databaseIoReadBytes;
    const writeBytes = event.usageStats.databaseIoWriteBytes;
    const value = functions.get(name) ?? { name, calls: 0, readBytes: 0, writeBytes: 0 };
    value.calls += 1;
    value.readBytes += readBytes;
    value.writeBytes += writeBytes;
    functions.set(name, value);
    timestamps.push(event.timestamp);
  }
  return {
    from: timestamps.length ? new Date(Math.min(...timestamps) * 1000).toISOString() : null,
    to: timestamps.length ? new Date(Math.max(...timestamps) * 1000).toISOString() : null,
    events: timestamps.length,
    functions: [...functions.values()]
      .sort((a, b) => b.readBytes + b.writeBytes - (a.readBytes + a.writeBytes))
      .slice(0, 10),
  };
}

/** Deployment credentials stay in the child environment, and the streaming child has a fixed deadline. */
async function recentFunctions(env: NodeJS.ProcessEnv, now: number, kind: string) {
  let stdout = '';
  try {
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.resolve('node_modules/convex/bin/main.js'),
        'logs',
        '--history',
        '1000',
        '--jsonl',
        ...(env.CONVEX_DEPLOY_KEY ? [] : ['--deployment', `dunezone:${kind}`]),
      ],
      { env, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }
    );
    stdout = result.stdout;
  } catch (error) {
    const failure = error as { killed?: boolean; stdout?: string };
    if (!failure.killed) {
      throw new Error('The bounded Convex log sample failed');
    }
    stdout = failure.stdout ?? '';
  }
  return summarizeFunctions(stdout, now);
}

export async function captureDeployment(env: NodeJS.ProcessEnv): Promise<DeploymentUsage> {
  const selection = env.CONVEX_DEPLOY_KEY?.split('|')[0] ?? env.CONVEX_DEPLOYMENT ?? '';
  const match = /^(prod|dev):([a-z0-9-]+)$/.exec(selection);
  if (!match) {
    throw new Error('Usage collection needs an explicit production or development deployment');
  }
  const [, kind, name] = match;
  const capturedAt = new Date().toISOString();
  const execFn: UsageExec = async (file, args, options) => await promisify(execFile)(file, args, options);
  const result = await convexUsage(execFn, { backendName: name!, project: 'dunezone', reference: kind! }, env);
  return deploymentSchema.parse({
    name,
    kind,
    capturedAt,
    usage: result.current,
    sample: await recentFunctions(env, Date.now(), kind!),
  });
}

function deploymentGrowth(
  current: DeploymentUsage,
  baseline: DeploymentUsage | undefined,
  elapsedHours: number | null
) {
  if (!baseline || baseline.name !== current.name || !elapsedHours) {
    return null;
  }
  const ioGb =
    current.usage.metrics.databaseIoGb.usage.current_month - baseline.usage.metrics.databaseIoGb.usage.current_month;
  const calls =
    current.usage.metrics.functionCalls.usage.current_month - baseline.usage.metrics.functionCalls.usage.current_month;
  if (elapsedHours < 1 || ioGb < 0 || calls < 0) {
    return null;
  }
  return { ioGb, calls, perDayGb: (ioGb * 24) / elapsedHours };
}

function assertDeploymentPair(deployments: UsageBaseline['deployments']) {
  if (
    deployments.production.kind !== 'prod' ||
    deployments.development.kind !== 'dev' ||
    deployments.production.name === deployments.development.name
  ) {
    throw new Error('Usage reports must identify distinct production and development deployments');
  }
}

/** Calendar counters are a reference window, never an invoice or the dashboard's billing-cycle total. */
export function assessUsage(
  deployments: UsageBaseline['deployments'],
  previous: UsageBaseline | undefined,
  now: string,
  referenceGb = 1,
  dailyAlertGb = 0.1
) {
  assertDeploymentPair(deployments);
  z.number().finite().positive().parse(referenceGb);
  z.number().finite().positive().parse(dailyAlertGb);
  const calendarMonthGb = Object.values(deployments).reduce(
    (sum, deployment) => sum + deployment.usage.metrics.databaseIoGb.usage.current_month,
    0
  );
  const activeAlerts = [0.75, 0.9, 1]
    .filter((ratio) => calendarMonthGb >= referenceGb * ratio)
    .map((ratio) => `calendar-${ratio}`);
  const elapsedHours = previous ? (Date.parse(now) - Date.parse(previous.capturedAt)) / 3_600_000 : null;
  const growth: Record<string, { ioGb: number; calls: number; perDayGb: number } | null> = {};
  for (const label of ['production', 'development'] as const) {
    const baseline = previous?.capturedAt.slice(0, 7) === now.slice(0, 7) ? previous.deployments[label] : undefined;
    const value = deploymentGrowth(deployments[label], baseline, elapsedHours);
    growth[label] = value;
    if (value && value.perDayGb >= dailyAlertGb) {
      activeAlerts.push(`daily-${label}`);
    }
  }

  const newAlerts = activeAlerts.filter((alert) => !previous?.activeAlerts.includes(alert));
  return {
    capturedAt: now,
    deployments,
    referenceGb,
    dailyAlertGb,
    calendarMonthGb,
    elapsedHours,
    growth,
    activeAlerts,
    newAlerts,
  };
}

export type UsageReport = ReturnType<typeof assessUsage>;

export function usageMarkdown(report: UsageReport) {
  const lines = [
    '# Convex usage',
    '',
    `Captured ${report.capturedAt}. Dune Zone production and cloud dev only.`,
    '',
    `Provider calendar-month database I/O: ${report.calendarMonthGb.toFixed(3)} GB. Reference: ${report.referenceGb} GB. This is not the dashboard billing window.`,
    '',
    '| Deployment | Calendar-month I/O | Calendar-month calls | I/O since baseline | Average GB/day |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const label of ['production', 'development'] as const) {
    const deployment = report.deployments[label];
    const growth = report.growth[label];
    lines.push(
      `| ${label}: ${deployment.name} | ${deployment.usage.metrics.databaseIoGb.usage.current_month.toFixed(3)} GB | ${deployment.usage.metrics.functionCalls.usage.current_month} | ${growth ? `${growth.ioGb.toFixed(3)} GB` : 'No comparable baseline'} | ${growth ? growth.perDayGb.toFixed(3) : 'Unknown'} |`
    );
  }
  lines.push(
    '',
    `Baseline interval: ${report.elapsedHours === null ? 'none' : `${report.elapsedHours.toFixed(1)} hours`}. Daily alert threshold: ${report.dailyAlertGb} GB per 24 hours.`,
    '',
    'Function counters below cover at most 1,000 recent completions within the last 24 hours. They are a sample, not daily totals. Component and parent counters are shown as reported and are never added to provider totals.'
  );
  for (const label of ['production', 'development'] as const) {
    const sample = report.deployments[label].sample;
    lines.push(
      '',
      `## ${label === 'production' ? 'Production' : 'Development'} recent functions`,
      '',
      `${sample.events} completions, ${sample.from ?? 'no available start'} to ${sample.to ?? 'no available end'}.`,
      '',
      '| Function | Calls | Read bytes | Write bytes |',
      '| --- | ---: | ---: | ---: |'
    );
    for (const row of sample.functions) {
      lines.push(`| ${row.name} | ${row.calls} | ${row.readBytes} | ${row.writeBytes} |`);
    }
  }
  lines.push(
    '',
    `New alerts: ${report.newAlerts.join(', ') || 'none'}.`,
    '',
    'Trace the named functions in Convex Usage and Insights. Compare the production and dev rows before changing queries or resetting data. The weekly snapshot can explain a scheduled burst; normal releases should not replay completed migrations.'
  );
  return lines.join('\n') + '\n';
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      capture: { type: 'string' },
      report: { type: 'string' },
      previous: { type: 'string' },
    },
    strict: true,
  });
  if (values.capture) {
    writeFileSync(values.capture, JSON.stringify(await captureDeployment(process.env), null, 2) + '\n');
  } else if (values.report) {
    const readDeployment = (name: string) =>
      deploymentSchema.parse(JSON.parse(readFileSync(path.join(values.report!, `${name}.json`), 'utf8')));
    const previous =
      values.previous && existsSync(values.previous)
        ? reportSchema.parse(JSON.parse(readFileSync(values.previous, 'utf8')))
        : undefined;
    const report = assessUsage(
      { production: readDeployment('production'), development: readDeployment('development') },
      previous,
      new Date().toISOString(),
      Number(process.env.CONVEX_IO_REFERENCE_GB ?? 1),
      Number(process.env.CONVEX_IO_DAILY_ALERT_GB ?? 0.1)
    );
    writeFileSync(path.join(values.report, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(path.join(values.report, 'report.md'), usageMarkdown(report));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, usageMarkdown(report));
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `alert=${report.newAlerts.length > 0}\n`);
    }
  } else {
    throw new Error('Choose --capture output.json or --report directory');
  }
}
