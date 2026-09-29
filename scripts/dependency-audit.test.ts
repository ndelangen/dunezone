import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { ATTEMPT_MS, RETRY_DELAYS_MS, auditDependencies, classifyAudit, verdictLine } from './dependency-audit';
import type { AuditAttempt } from './dependency-audit';
import { TransientError } from './retry-transient';

/* Output of bun audit 1.3.9 and 1.3.14, copied from local runs and from the 2026-09-04 job logs. */
const CLEAN: AuditAttempt = {
  exitCode: 0,
  exitedDueToTimeout: false,
  output: 'bun audit v1.3.9 (cf6cdbbb)\nNo vulnerabilities found\n',
};
const ADVISORIES: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output: [
    'bun audit v1.3.9 (cf6cdbbb)',
    'lodash  <4.17.21',
    '  (direct dependency)',
    '  high: Command Injection in lodash - https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
    '  moderate: Regular Expression Denial of Service (ReDoS) in lodash - https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
    '',
    '2 vulnerabilities (1 high, 1 moderate)',
    '',
    'To update all dependencies to the latest compatible versions:',
    '  bun update',
    '',
  ].join('\n'),
};
const CLOSED: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output: 'bun audit v1.3.14 (0d9b296a)\nConnectionClosed: audit request failed\n',
};
const TIMED_OUT: AuditAttempt = {
  exitCode: 1,
  exitedDueToTimeout: false,
  output: 'bun audit v1.3.14 (0d9b296a)\nTimeout: audit request failed\n',
};
const KILLED: AuditAttempt = { exitCode: null, exitedDueToTimeout: true, output: 'bun audit v1.3.14 (0d9b296a)\n' };
const BROKEN: AuditAttempt = { exitCode: 1, exitedDueToTimeout: false, output: 'error: Lockfile not found\n' };

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
      summary: '2 vulnerabilities (1 high, 1 moderate)',
    });
    expect(classifyAudit(BROKEN)).toEqual({ kind: 'unexplained', exitCode: 1 });
    expect(verdictLine(classifyAudit(ADVISORIES))).toBe(
      'dependency audit: advisories at or above moderate found (2 vulnerabilities (1 high, 1 moderate))'
    );
  });

  test('names a transport failure and a killed attempt as transient', () => {
    expect(() => classifyAudit(CLOSED)).toThrow(TransientError);
    expect(() => classifyAudit(CLOSED)).toThrow('ConnectionClosed: audit request failed');
    expect(() => classifyAudit(TIMED_OUT)).toThrow('Timeout: audit request failed');
    expect(() => classifyAudit(KILLED)).toThrow(`no answer within ${ATTEMPT_MS / 1000} s`);
  });
});

describe('auditDependencies', () => {
  test('retries the registry through transport failures and keeps the attempt that answered', async () => {
    const h = scripted([CLOSED, TIMED_OUT, CLEAN]);
    await expect(h.audit()).resolves.toEqual({ verdict: { kind: 'clean' }, output: CLEAN.output });
    expect(h.calls()).toBe(3);
    expect(h.log).toEqual([
      'npm advisory registry: attempt 1 of 4 failed (ConnectionClosed: audit request failed); retrying in 5 s',
      'npm advisory registry: attempt 2 of 4 failed (Timeout: audit request failed); retrying in 15 s',
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
      verdict: { kind: 'advisories', summary: '2 vulnerabilities (1 high, 1 moderate)' },
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
