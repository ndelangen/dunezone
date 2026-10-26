import { gameSnapshotSchema } from '@shared/play/protocol';
import { z } from 'zod';

const object = z.record(z.string(), z.unknown());
const page = z.object({ entries: z.array(object).max(1000), more: z.boolean() });
const reportSchema = z.object({
  server: z.object({
    format: z.literal('dunezone-game-report-v1'),
    capturedAt: z.iso.datetime(),
    gameId: z.string().min(1).max(200),
    gitSha: z.string().max(100),
    versionId: z.string().max(100),
    state: object,
    captures: object,
    activity: object,
    conversations: object,
    events: z.object({ game: page, audit: page }),
  }),
  browser: z.object({
    snapshot: object,
    conversations: z.unknown(),
    diagnostics: object,
    logs: z.array(z.object({ at: z.string(), level: z.string(), text: z.string() })).max(500),
    droppedLogs: z.number().int().nonnegative(),
  }),
});

export type Report = z.infer<typeof reportSchema>;
export const MAX_REPORT_BYTES = 20 * 1024 * 1024;

/** Imported reports are untrusted JSON; bound traversal before a schema or renderer walks them. */
export function parseReport(text: string): Report {
  if (new TextEncoder().encode(text).byteLength > MAX_REPORT_BYTES) {
    throw new Error('Choose a report smaller than 20 MB.');
  }
  let nodes = 0;
  const value: unknown = JSON.parse(text);
  const pending = [{ value, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > 300_000 || entry.depth > 80) {
      throw new Error('This report is too complex to inspect safely.');
    }
    if (entry.value && typeof entry.value === 'object') {
      for (const [key, child] of Object.entries(entry.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
          throw new Error('This report contains an unsafe object key.');
        }
        pending.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('This file is not a supported Dune Zone bug report.');
  }
  return parsed.data;
}

export function reportSnapshot(report: Report, source: 'server' | 'browser') {
  const ruleset = object.safeParse(report.server.captures.ruleset);
  const input =
    source === 'browser'
      ? report.browser.snapshot.snapshot
      : {
          ...report.server.state,
          board: ruleset.success ? ruleset.data.board : undefined,
        };
  return gameSnapshotSchema.safeParse(input);
}

/** Compare only fields both captures contain; private server fields have no browser equivalent. */
export function comparableSnapshots(report: Report) {
  const browser = object.safeParse(report.browser.snapshot.snapshot);
  if (!browser.success) {
    return null;
  }
  const keys = Object.keys(browser.data).filter((key) => Object.hasOwn(report.server.state, key));
  return {
    server: Object.fromEntries(keys.map((key) => [key, report.server.state[key]])),
    browser: Object.fromEntries(keys.map((key) => [key, browser.data[key]])),
  };
}

/** An imported file may not make the table load artwork from an arbitrary host or execute SVG markup. */
export function canRenderReport(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(canRenderReport);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).every(canRenderReport);
  }
  if (typeof value !== 'string') {
    return true;
  }
  if (/<\s*(?:script|foreignObject|iframe|image|use)\b|\bon\w+\s*=|url\s*\(/iu.test(value)) {
    return false;
  }
  if (/^(?:[a-z][a-z\d+.-]*:\/\/|data:|blob:|javascript:|file:|[/\\])/iu.test(value.trim())) {
    try {
      const url = new URL(value, 'https://dune.zone');
      return (
        url.origin === 'https://dune.zone' &&
        ['/published/', '/homepage-table/', '/vector/', '/image/'].some((prefix) => url.pathname.startsWith(prefix)) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }
  return true;
}

export function renderSnapshot(report: Report, source: 'server' | 'browser') {
  const parsed = reportSnapshot(report, source);
  if (!parsed.success) {
    return null;
  }
  /* Player avatars are not part of the table and may have been redacted in the export. */
  const stripAvatars = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(stripAvatars);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          ['avatarUrl', 'avatar'].includes(key) ? null : stripAvatars(entry),
        ])
      );
    }
    return value;
  };
  const snapshot = gameSnapshotSchema.parse(stripAvatars(parsed.data));
  return canRenderReport(snapshot) ? snapshot : null;
}
