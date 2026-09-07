import { TransientError, describeError, retryTransient } from './retry-transient';
import type { RetryTransientOptions } from './retry-transient';

/*
 * `bun audit` fails closed: an unreachable registry exits 1 exactly as an advisory does, and on
 * 2026-09-04 one registry outage refused four PR runs in an hour, three of them after bun's own
 * five-minute request timeout had used the whole job (#1053).
 * A healthy audit answers within a second, so each attempt is killed after ATTEMPT_MS, a transport
 * failure or a killed attempt retries with backoff, and the last line of the job names which of
 * three outcomes it ended on: clean, advisories, or a registry unreachable after every attempt.
 * Advisories never retry.
 * The job that runs this has no node_modules, so this file imports nothing from a package.
 */

export const AUDIT_LEVEL = 'moderate';
export const ATTEMPT_MS = 30_000;
export const RETRY_DELAYS_MS: readonly number[] = [5000, 15_000, 45_000];

export type AuditAttempt = {
  exitCode: number | null;
  exitedDueToTimeout: boolean;
  output: string;
};

export type AuditVerdict =
  | { kind: 'clean' }
  | { kind: 'advisories'; summary: string }
  | { kind: 'unexplained'; exitCode: number | null };

/*
 * bun prints `<Reason>: audit request failed` on its own line for every transport failure, and
 * closes an advisory table with `N vulnerabilities (...)`, so the output and the exit code classify
 * an attempt.
 * An exit 1 with neither line is refused as unexplained rather than reported as an advisory.
 */
export function classifyAudit(attempt: AuditAttempt): AuditVerdict {
  if (attempt.exitedDueToTimeout) {
    throw new TransientError(`no answer within ${ATTEMPT_MS / 1000} s`);
  }
  const transport = /^.*audit request failed.*$/m.exec(attempt.output);
  if (transport) {
    throw new TransientError(transport[0].trim());
  }
  if (attempt.exitCode === 0) {
    return { kind: 'clean' };
  }
  const summary = /^\d+ vulnerabilit(?:y|ies)\b.*$/m.exec(attempt.output);
  if (summary) {
    return { kind: 'advisories', summary: summary[0].trim() };
  }
  return { kind: 'unexplained', exitCode: attempt.exitCode };
}

function runBunAudit(extraArgs: readonly string[]): AuditAttempt {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, 'audit', `--audit-level=${AUDIT_LEVEL}`, ...extraArgs],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: ATTEMPT_MS,
  });
  return {
    exitCode: proc.exitCode,
    exitedDueToTimeout: proc.exitedDueToTimeout === true,
    output: `${proc.stderr.toString()}${proc.stdout.toString()}`,
  };
}

export type AuditRun = { verdict: AuditVerdict; output: string };

export async function auditDependencies(
  run: () => AuditAttempt,
  options: Pick<RetryTransientOptions, 'sleep' | 'log'> = {}
): Promise<AuditRun> {
  let output = '';
  const verdict = await retryTransient(
    () => {
      const attempt = run();
      output = attempt.output;
      return classifyAudit(attempt);
    },
    { subject: 'npm advisory registry', delaysMs: RETRY_DELAYS_MS, ...options }
  );
  return { verdict, output };
}

export function verdictLine(verdict: AuditVerdict): string {
  switch (verdict.kind) {
    case 'clean':
      return `dependency audit: no advisories at or above ${AUDIT_LEVEL}`;
    case 'advisories':
      return `dependency audit: advisories at or above ${AUDIT_LEVEL} found (${verdict.summary})`;
    case 'unexplained':
      return `dependency audit: bun audit exited ${String(verdict.exitCode)} without a verdict`;
  }
}

if (import.meta.main) {
  try {
    const { verdict, output } = await auditDependencies(() => runBunAudit(process.argv.slice(2)));
    process.stdout.write(output);
    console.log(verdictLine(verdict));
    process.exitCode = verdict.kind === 'clean' ? 0 : 1;
  } catch (error) {
    console.error(`dependency audit: ${describeError(error)}`);
    process.exitCode = 1;
  }
}
