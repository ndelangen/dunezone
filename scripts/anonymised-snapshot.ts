import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { ExportEntries, SnapshotReport } from './lib/snapshot-anonymiser';
import { SnapshotRefused } from './lib/snapshot-anonymiser';
import { exportProductionSnapshot } from './provision';
import { anonymiseZip } from './snapshot-anonymise';

/**
 * The anonymised snapshot job (#1559), which `.github/workflows/anonymised-snapshot.yml` runs.
 *
 * It exports production the way the dev rebuild does, anonymises the export, and deletes the raw export as soon as the anonymiser has read it.
 * Its step summary gives table names, row counts, kept field names and the leak scan result, never a value, because Actions logs on this repository are public.
 * It uploads nothing itself.
 * The workflow's upload step does that, and only when SNAPSHOT_UPLOAD is 'true'.
 * It refuses to start anywhere but a GitHub Actions run on main that holds the production deploy key, so no other machine ever receives the export.
 */

/** The job's directory under RUNNER_TEMP, which the workflow uploads the snapshot from and deletes when the job ends. */
export const JOB_DIRECTORY = 'anonymised-snapshot';

/** The anonymised snapshot's file name inside the job's directory. */
export const SNAPSHOT_FILE = 'snapshot.zip';

type JobEnvironment = { directory: string; summaryPath: string; upload: boolean };

/** A refusal to start, whose message names only what is missing. */
class JobRefused extends Error {}

/** Reads what the job needs, and refuses unless this is a GitHub Actions run on main with the production deploy key. */
export function jobEnvironment(env: NodeJS.ProcessEnv): JobEnvironment {
  const problems: string[] = [];
  if (env.GITHUB_ACTIONS !== 'true') {
    problems.push('it runs only in GitHub Actions');
  }
  if (env.GITHUB_REF !== 'refs/heads/main') {
    problems.push('it runs only on main');
  }
  if (!env.CONVEX_PROD_DEPLOY_KEY) {
    problems.push('CONVEX_PROD_DEPLOY_KEY is not set');
  }
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP)) {
    problems.push('RUNNER_TEMP is not an absolute path');
  }
  if (!env.GITHUB_STEP_SUMMARY) {
    problems.push('GITHUB_STEP_SUMMARY is not set');
  }
  if (problems.length > 0) {
    throw new JobRefused(`The anonymised snapshot job refused to start: ${problems.join(', ')}`);
  }
  return {
    directory: path.join(env.RUNNER_TEMP!, JOB_DIRECTORY),
    summaryPath: env.GITHUB_STEP_SUMMARY!,
    upload: env.SNAPSHOT_UPLOAD === 'true',
  };
}

type Outcome =
  | { kind: 'written'; report: SnapshotReport; snapshot: ExportEntries }
  | { kind: 'refused'; problems: readonly string[] }
  | { kind: 'failed'; stage: 'exporting production' | 'anonymising the export' };

const TABLE_DOCUMENTS = /^([A-Za-z][A-Za-z0-9_]*)\/documents\.jsonl$/;

/** Each table's top-level field names across the rows of the written snapshot, leaving out `_id` and `_creationTime`. */
function keptFields(snapshot: ExportEntries): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  for (const [entry, text] of snapshot) {
    const table = TABLE_DOCUMENTS.exec(entry)?.[1];
    if (!table) {
      continue;
    }
    const names = new Set<string>();
    for (const line of text.split('\n').filter((row) => row.trim().length > 0)) {
      Object.keys(JSON.parse(line) as object).forEach((name) => names.add(name));
    }
    names.delete('_id');
    names.delete('_creationTime');
    fields.set(table, [...names].sort());
  }
  return fields;
}

const code = (name: string) => `\`${name}\``;

function uploadLine(upload: boolean) {
  return upload
    ? `Upload: on. The next step uploads ${code(SNAPSHOT_FILE)} as an artifact kept for one day.`
    : 'Upload: off. This is a dry run, and nothing from it is uploaded.';
}

function writtenSummary({ report, snapshot }: Extract<Outcome, { kind: 'written' }>): string[] {
  const fields = keptFields(snapshot);
  const rows = report.tables.map(({ table, dropReason, rowsIn, rowsOut }) => {
    const policy = dropReason === null ? 'kept' : `dropped: ${dropReason}`;
    const kept = (fields.get(table) ?? []).map(code).join(', ');
    return `| ${code(table)} | ${policy} | ${rowsIn} | ${rowsOut} | ${kept} |`;
  });
  return [
    'Leak scan: no findings in the written snapshot.',
    '',
    'Every kept row also keeps `_id` and `_creationTime`. The one `users` row is the placeholder owner.',
    '',
    '| Table | Policy | Rows in | Rows out | Kept fields |',
    '| --- | --- | ---: | ---: | --- |',
    ...rows,
    '',
    `Component data dropped: ${report.droppedComponents.map(code).join(', ') || 'none'}.`,
  ];
}

/** The step summary, which names tables and fields and gives counts, never values. */
export function summaryMarkdown(outcome: Outcome, upload: boolean): string {
  const heading = '## Anonymised snapshot';
  const body = (() => {
    switch (outcome.kind) {
      case 'written':
        return [uploadLine(upload), '', ...writtenSummary(outcome)];
      case 'refused':
        return [
          'Refused. The anonymiser or the leak scan stopped the run, so no snapshot was kept and nothing was uploaded.',
          '',
          ...outcome.problems.map((problem) => `- ${problem}`),
        ];
      case 'failed':
        return [
          `Failed while ${outcome.stage}. Nothing was uploaded.`,
          'The error message stays out of this public summary. The step log has the command output.',
        ];
    }
  })();
  return `${[heading, '', ...body].join('\n')}\n`;
}

function anonymiseProduction(env: NodeJS.ProcessEnv, exportDirectory: string, out: string): Outcome {
  let exportPath: string;
  try {
    exportPath = exportProductionSnapshot(env, exportDirectory);
  } catch {
    return { kind: 'failed', stage: 'exporting production' };
  }
  try {
    return { kind: 'written', ...anonymiseZip(exportPath, out) };
  } catch (error) {
    return error instanceof SnapshotRefused
      ? { kind: 'refused', problems: error.problems }
      : { kind: 'failed', stage: 'anonymising the export' };
  }
}

function main(env: NodeJS.ProcessEnv): boolean {
  const job = jobEnvironment(env);
  const exportDirectory = path.join(job.directory, 'export');
  mkdirSync(job.directory, { recursive: true, mode: 0o700 });
  let outcome: Outcome;
  try {
    outcome = anonymiseProduction(env, exportDirectory, path.join(job.directory, SNAPSHOT_FILE));
  } finally {
    rmSync(exportDirectory, { recursive: true, force: true });
  }
  const summary = summaryMarkdown(outcome, job.upload);
  appendFileSync(job.summaryPath, summary);
  console.log(summary);
  return outcome.kind === 'written';
}

if (import.meta.main) {
  try {
    if (!main(process.env)) {
      process.exitCode = 1;
    }
  } catch (error) {
    /* Any other message could quote what it failed on, so only its name reaches the public log. */
    const name = error instanceof Error ? error.name : typeof error;
    console.error(error instanceof JobRefused ? error.message : `The anonymised snapshot job failed (${name})`);
    process.exitCode = 1;
  }
}
