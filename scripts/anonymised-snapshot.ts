import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { ExportEntries, SnapshotReport } from './lib/snapshot-anonymiser';
import { SnapshotRefused } from './lib/snapshot-anonymiser';
import { exportProductionSnapshot } from './provision';
import { anonymiseZip, readZip } from './snapshot-anonymise';

/**
 * The anonymised snapshot job (#1559), which `.github/workflows/anonymised-snapshot.yml` runs.
 * `.github/workflows/dev-rebuild.yml` runs it too, and loads the snapshot it writes into cloud dev without uploading it.
 *
 * It exports production the way the dev rebuild does, reads the raw export into memory and deletes it before anonymising, whether the read succeeded or not.
 * Its step summary gives table names, row counts, kept field names and the leak scan result, never a value, because Actions logs on this repository are public.
 * It uploads nothing itself.
 * The workflow's upload step does that, and only when SNAPSHOT_UPLOAD is 'true'.
 * It refuses to start unless it is a GitHub Actions run on main that holds the production deploy key, so a local run stops before it exports anything.
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

type Stage = 'exporting production' | 'reading the export' | 'anonymising the export';

type Outcome =
  | { kind: 'written'; report: SnapshotReport; snapshot: ExportEntries }
  | { kind: 'refused'; problems: readonly string[] }
  | { kind: 'failed'; stage: Stage; errorName: string };

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
    : 'Upload: off. Nothing from this run is uploaded.';
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
    'Every kept row also keeps `_id` and `_creationTime`. The one `users` row and the one `profiles` row are the placeholder owner.',
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
          `Failed while ${outcome.stage} (${outcome.errorName}). Nothing was uploaded.`,
          'The error message stays out of this public summary, because it could quote what it failed on.',
        ];
    }
  })();
  return `${[heading, '', ...body].join('\n')}\n`;
}

/** Only an error's name reaches the public log, because its message could quote what it failed on. */
const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error);

function stopped(stage: Stage, error: unknown): Outcome {
  return error instanceof SnapshotRefused
    ? { kind: 'refused', problems: error.problems }
    : { kind: 'failed', stage, errorName: errorName(error) };
}

/** The raw export is deleted once it is read into memory, before the anonymiser starts, whether the read succeeded or not. */
function anonymiseProduction(env: NodeJS.ProcessEnv, exportDirectory: string, out: string): Outcome {
  let stage: Stage = 'exporting production';
  let exported: ExportEntries;
  try {
    const exportPath = exportProductionSnapshot(env, exportDirectory);
    stage = 'reading the export';
    exported = readZip(exportPath);
  } catch (error) {
    return stopped(stage, error);
  } finally {
    rmSync(exportDirectory, { recursive: true, force: true });
  }
  try {
    return { kind: 'written', ...anonymiseZip(exported, out) };
  } catch (error) {
    return stopped('anonymising the export', error);
  }
}

function main(env: NodeJS.ProcessEnv): boolean {
  const job = jobEnvironment(env);
  mkdirSync(job.directory, { recursive: true, mode: 0o700 });
  const outcome = anonymiseProduction(env, path.join(job.directory, 'export'), path.join(job.directory, SNAPSHOT_FILE));
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
    console.error(
      error instanceof JobRefused ? error.message : `The anonymised snapshot job failed (${errorName(error)})`
    );
    process.exitCode = 1;
  }
}
