import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { ATTEMPT_MS, RETRY_DELAYS_MS, auditDependencies, classifyAudit, verdictLine } from './dependency-audit';
import type { AuditAttempt } from './dependency-audit';
import { TransientError } from './retry-transient';

/*
 * Output of bun audit 1.4.2 as the script captures it, stderr first, from local runs on 29 September 2026: this tree,
 * main's tree before the undici move, and a stand-in registry on 127.0.0.1 that drops the connection or answers 503.
 */
const CLEAN: AuditAttempt = {
  exitCode: 0,
  exitedDueToTimeout: false,
  output: 'bun audit v1.4.2 (744846f84)\n\nNo vulnerabilities found (checked 846 packages) [415.00ms]\n',
};
const ADVISORIES: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output: [
    'bun audit v1.4.2 (744846f84)',
    '',
    'undici@8.10.0, 6.28.0, 7.29.0',
    '  workspace:svg-obj-tool > jsdom > undici',
    '  miniflare > undici',
    '  @codecov/bundle-analyzer > @codecov/bundler-plugin-core > @actions/github > undici',
    '  moderate: undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression (>=8.1.0 <8.10.2) - https://github.com/advisories/GHSA-3wwx-pv8p-q78v',
    '  moderate: undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression (>=7.28.0 <7.29.1) - https://github.com/advisories/GHSA-3wwx-pv8p-q78v',
    '  moderate: undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression (>=6.25.0 <6.28.1) - https://github.com/advisories/GHSA-3wwx-pv8p-q78v',
    '',
    '3 vulnerabilities (3 moderate)',
    '',
    '  bun audit fix           upgrade the vulnerable packages within their ranges',
    '  bun audit fix --latest  also cross major versions',
    '',
  ].join('\n'),
};
const CLOSED: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output:
    'error: POST http://127.0.0.1:47811/-/npm/v1/security/advisories/bulk - ConnectionClosed\nbun audit v1.4.2 (744846f84)\n\n',
};
const UNAVAILABLE: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output:
    'error: POST http://127.0.0.1:47812/-/npm/v1/security/advisories/bulk - 503\nbun audit v1.4.2 (744846f84)\n\n',
};
const KILLED: AuditAttempt = { exitCode: null, exitedDueToTimeout: true, output: 'bun audit v1.4.2 (744846f84)\n\n' };
const BROKEN: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output: "error: missing lockfile, nothing to audit\nnote: run 'bun install' first\nbun audit v1.4.2 (744846f84)\n\n",
};

function scripted(attempts: AuditAttempt[]) {
  const log: string[] = [];
  let calls = 0;
  const run = () => {
    const attempt = attempts[calls];
    calls += 1;
    if (!attempt) {
      throw new Error('ran out of scripted attempts');
    }
    return attempt;
  };
  const audit = () => auditDependencies(run, { sleep: async () => {}, log: (line) => log.push(line) });
  return { audit, log, calls: () => calls };
}

describe('classifyAudit', () => {
  test('reads clean, advisories and an exit without a verdict from the exit code and the summary line', () => {
    expect(classifyAudit(CLEAN)).toEqual({ kind: 'clean' });
    expect(classifyAudit(ADVISORIES)).toEqual({
      kind: 'advisories',
      summary: '3 vulnerabilities (3 moderate)',
    });
    expect(classifyAudit(BROKEN)).toEqual({ kind: 'unexplained', exitCode: 1 });
    expect(verdictLine(classifyAudit(ADVISORIES))).toBe(
      'dependency audit: advisories at or above moderate found (3 vulnerabilities (3 moderate))'
    );
  });

  test('names a transport failure and a killed attempt as transient', () => {
    expect(() => classifyAudit(CLOSED)).toThrow(TransientError);
    expect(() => classifyAudit(CLOSED)).toThrow(
      'POST http://127.0.0.1:47811/-/npm/v1/security/advisories/bulk - ConnectionClosed'
    );
    expect(() => classifyAudit(UNAVAILABLE)).toThrow(
      'POST http://127.0.0.1:47812/-/npm/v1/security/advisories/bulk - 503'
    );
    expect(() => classifyAudit(KILLED)).toThrow(`no answer within ${ATTEMPT_MS / 1000} s`);
  });
});

describe('auditDependencies', () => {
  test('retries the registry through transport failures and keeps the attempt that answered', async () => {
    const h = scripted([CLOSED, UNAVAILABLE, CLEAN]);
    await expect(h.audit()).resolves.toEqual({ verdict: { kind: 'clean' }, output: CLEAN.output });
    expect(h.calls()).toBe(3);
    expect(h.log).toEqual([
      'npm advisory registry: attempt 1 of 4 failed (POST http://127.0.0.1:47811/-/npm/v1/security/advisories/bulk - ConnectionClosed); retrying in 5 s',
      'npm advisory registry: attempt 2 of 4 failed (POST http://127.0.0.1:47812/-/npm/v1/security/advisories/bulk - 503); retrying in 15 s',
    ]);
  });

  test('refuses an unreachable registry after four attempts with the reason named', async () => {
    const h = scripted([KILLED, KILLED, KILLED, KILLED]);
    await expect(h.audit()).rejects.toThrow(
      'npm advisory registry unreachable after 4 attempts; last: no answer within 30 s'
    );
    expect(h.calls()).toBe(4);
  });

  test('never retries an advisory', async () => {
    const h = scripted([ADVISORIES, CLEAN]);
    await expect(h.audit()).resolves.toMatchObject({
      verdict: { kind: 'advisories', summary: '3 vulnerabilities (3 moderate)' },
    });
    expect(h.calls()).toBe(1);
    expect(h.log).toEqual([]);
  });

  test('the audit job runs this script and its timeout holds every attempt plus a minute of setup', () => {
    const workflow = readFileSync(path.resolve(process.cwd(), '.github/workflows/reusable-verify.yml'), 'utf8');
    const job = /dependency_audit:\n\s+runs-on: [^\n]+\n\s+timeout-minutes: (\d+)\n([\s\S]*?)\n\n/.exec(workflow);
    expect(job?.[2]).toContain('run: bun run dependencies:audit');
    const worstCaseMs = (RETRY_DELAYS_MS.length + 1) * ATTEMPT_MS + RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
    expect(Number(job?.[1]) * 60_000).toBeGreaterThan(worstCaseMs + 60_000);
  });
});
