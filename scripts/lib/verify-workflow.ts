/*
 * The verify workflow as the contract tests read it: one job at a time, from its key to the next job's key.
 * Those tests hold a job's shape to what a script or a shard list requires, which no type can say (ADR-0001's narrow exception).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const VERIFY_WORKFLOW = '.github/workflows/reusable-verify.yml';

/**
 * One job of the verify workflow, from its key to the next job's key.
 * The next key may hold any character a job id can: a letter, a digit, `_` or `-`, as in `tool_e2e`.
 */
export function verifyJob(id: string, root = process.cwd()): string {
  const workflow = readFileSync(path.join(root, VERIFY_WORKFLOW), 'utf8');
  const start = workflow.indexOf(`\n  ${id}:\n`);
  if (start < 0) {
    throw new Error(`${VERIFY_WORKFLOW} has no ${id} job`);
  }
  const length = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return length === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + length);
}

/** The job's `timeout-minutes`, which every job of the workflow sets. */
export function jobTimeoutMinutes(job: string): number {
  const minutes = /\n {4}timeout-minutes: (\d+)\n/.exec(job)?.[1];
  if (minutes === undefined) {
    throw new Error('the job sets no timeout-minutes');
  }
  return Number(minutes);
}
