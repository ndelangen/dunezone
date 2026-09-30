import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import type { ExportEntries, SnapshotReport } from './lib/snapshot-anonymiser';
import { anonymiseExport, scanSnapshot, SnapshotRefused } from './lib/snapshot-anonymiser';

/**
 * Anonymises a Convex export zip into the snapshot that local and cloud dev load (#1559).
 *
 * bun run ./scripts/snapshot-anonymise.ts --export <convex-export.zip> --out <snapshot.zip>
 *
 * The export is read entry by entry with `unzip -p`, so it is never unpacked to disk, and only anonymised files are written.
 * The written zip is read back and scanned again before the run succeeds, so the scan covers the file a later step would upload.
 * Output names tables and fields and gives counts, never values.
 */

/* Entry names are checked before any is read: no absolute paths, no `..`, and nothing unzip would read as a pattern. */
const ENTRY_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_ENTRY_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args[0]} failed with status ${result.status ?? 'none'}`);
  }
  return result.stdout;
}

/** Reads every entry of the zip at `file` into memory, refusing entry names outside the export layout. */
export function readZip(file: string): ExportEntries {
  const names = run('/usr/bin/unzip', ['-Z1', file])
    .split('\n')
    .filter((name) => name.length > 0 && !name.endsWith('/'));
  const unsafe = names.filter((name) => !ENTRY_NAME.test(name));
  if (unsafe.length > 0) {
    throw new SnapshotRefused([`${unsafe.length} zip entries have names outside the export layout`]);
  }
  return new Map(names.map((name) => [name, run('/usr/bin/unzip', ['-p', file, name])]));
}

function writeZip(entries: ExportEntries, out: string) {
  const staging = mkdtempSync(path.join(tmpdir(), 'dunezone-snapshot-'));
  const partial = `${out}.partial.zip`;
  try {
    const names = [...entries.keys()].sort();
    for (const name of names) {
      const file = path.join(staging, name);
      mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, entries.get(name)!, { mode: 0o600 });
    }
    rmSync(partial, { force: true });
    run('/usr/bin/zip', ['-q', '-X', '-D', partial, ...names], staging);
    renameSync(partial, out);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(partial, { force: true });
  }
}

function printReport(report: SnapshotReport) {
  for (const { table, dropReason, rowsIn, rowsOut, droppedFields } of report.tables) {
    const action = dropReason === null ? 'kept' : `dropped (${dropReason})`;
    const fields = droppedFields.length > 0 ? `, fields dropped: ${droppedFields.join(', ')}` : '';
    console.log(`${table}: ${action}, ${rowsIn} rows in, ${rowsOut} out${fields}`);
  }
  for (const { component, dropReason } of report.droppedComponents) {
    console.log(`component ${component}: dropped (${dropReason})`);
  }
}

/**
 * Anonymises the export's entries into a new snapshot zip at `out`, then reads the written file back and scans it.
 * It takes the entries rather than the export's path, so a caller can delete the export as soon as it has read it.
 * It returns the report and the entries read back, so a caller describes the file a later step would upload.
 * On any refusal the written file is removed.
 */
export function anonymiseZip(
  exported: ExportEntries,
  out: string
): { report: SnapshotReport; snapshot: ExportEntries } {
  if (existsSync(out)) {
    throw new Error(`${out} already exists, and the anonymiser never overwrites a file`);
  }
  const { entries, report } = anonymiseExport(exported);
  writeZip(entries, out);
  try {
    const snapshot = readZip(out);
    const findings = scanSnapshot(snapshot);
    if (findings.length > 0) {
      throw new SnapshotRefused(findings.map(({ table, field, kind }) => `leak scan: ${kind} in ${table}.${field}`));
    }
    return { report, snapshot };
  } catch (error) {
    rmSync(out, { force: true });
    throw error;
  }
}

function main(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: { export: { type: 'string' }, out: { type: 'string' } },
    strict: true,
  });
  if (!values.export || !values.out) {
    throw new Error('Usage: snapshot-anonymise --export <convex-export.zip> --out <snapshot.zip>');
  }
  const out = path.resolve(values.out);
  const { report } = anonymiseZip(readZip(path.resolve(values.export)), out);
  printReport(report);
  console.log(`Wrote the anonymised snapshot to ${out}.`);
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'The anonymiser failed');
    process.exitCode = 1;
  }
}
