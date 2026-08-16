import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

const guardEntrySchema = z.object({
  id: z.string().min(1),
  phase: z.union([z.literal('widen'), z.literal('narrow')]),
  requires: z.array(z.string().min(1)),
});

const guardManifestSchema = z.object({
  entries: z.array(guardEntrySchema).min(1),
});

function parseArgs(argv: string[]) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const mode = positional[0] ?? 'deploy';
  const timeoutMsRaw = positional[1] ?? `${45 * 60 * 1000}`;
  const intervalMsRaw = positional[2] ?? '5000';
  const timeoutMs = Number(timeoutMsRaw);
  const intervalMs = Number(intervalMsRaw);
  const useProd = argv.includes('--prod');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid timeoutMs: ${timeoutMsRaw}`);
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(`Invalid intervalMs: ${intervalMsRaw}`);
  }
  return { mode, timeoutMs, intervalMs, useProd };
}

function manifestPath() {
  return join(import.meta.dir, '..', 'convex', 'migration-guards.json');
}

async function loadManifest() {
  const path = manifestPath();
  if (!existsSync(path)) {
    throw new Error(`Missing manifest: ${path}`);
  }
  const json = await Bun.file(path).json();
  return guardManifestSchema.parse(json);
}

function requiredForAnyNarrow(entries: z.infer<typeof guardManifestSchema>['entries']) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.phase === 'narrow') {
      for (const id of entry.requires) {
        ids.add(id);
      }
    }
  }
  return Array.from(ids).sort();
}

function deploySet(entries: z.infer<typeof guardManifestSchema>['entries']) {
  return entries
    .filter((entry) => entry.phase === 'widen')
    .map((entry) => entry.id)
    .sort();
}

function cmdFor(functionName: string, args: unknown, useProd: boolean): string {
  const prodFlag = useProd ? ' --prod' : '';
  return `bunx convex run ${functionName} '${JSON.stringify(args)}'${prodFlag}`;
}

function runCmd(command: string) {
  const proc = Bun.spawnSync({
    cmd: ['bash', '-lc', command],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = proc.stdout.toString();
  const stderr = proc.stderr.toString();
  if (proc.exitCode !== 0) {
    throw new Error([`Command failed: ${command}`, stdout.trim(), stderr.trim()].filter(Boolean).join('\n'));
  }
  return stdout.trim();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type MigrationStatus = {
  name: string;
  state: string;
  isDone: boolean;
  processed: number;
  error?: string;
};

function parseStatuses(raw: string): MigrationStatus[] {
  try {
    return z
      .array(
        z.object({
          name: z.string(),
          state: z.string(),
          isDone: z.boolean(),
          processed: z.number(),
          error: z.string().optional(),
        })
      )
      .parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function formatStatusForLog(statuses: MigrationStatus[]) {
  if (statuses.length === 0) {
    return 'unavailable';
  }
  return statuses
    .map(
      (s) =>
        `${s.name}[state=${s.state},done=${String(s.isDone)},processed=${s.processed}${s.error ? `,error=${s.error}` : ''}]`
    )
    .join('; ');
}

async function ensureRequiredMigrationsReady({
  idsToRun,
  required,
  timeoutMs,
  intervalMs,
  useProd,
  modeLabel,
}: {
  idsToRun: string[];
  required: string[];
  timeoutMs: number;
  intervalMs: number;
  useProd: boolean;
  modeLabel: string;
}) {
  const manifest = await loadManifest();
  if (manifest.entries.length === 0) {
    throw new Error('No entries defined in migration-guards.json');
  }

  runCmd(cmdFor('migrations:runRequired', { ids: idsToRun }, useProd));
  const deadline = Date.now() + timeoutMs;
  let lastStatusRaw = '';

  while (Date.now() < deadline) {
    try {
      runCmd(cmdFor('migrations:assertReadyForNarrow', { required }, useProd));
      runCmd(cmdFor('migrations:syncMigrationRuns', { ids: required }, useProd));
      console.log(JSON.stringify({ ok: true, mode: modeLabel, required, idsToRun }));
      return;
    } catch {
      try {
        lastStatusRaw = runCmd(cmdFor('migrations:getStatus', { ids: required }, useProd));
      } catch {
        // Ignore status fetch failures while polling and continue until timeout.
      }
      await sleep(intervalMs);
    }
  }

  const statuses = parseStatuses(lastStatusRaw);
  const retryCommand = `bun run ./scripts/migration-guards.ts ${modeLabel} ${timeoutMs} ${intervalMs}${useProd ? ' --prod' : ''}`;
  throw new Error(
    [
      `Timed out waiting for required migrations after ${timeoutMs}ms (${modeLabel}).`,
      `Required IDs: ${required.join(', ') || 'none'}`,
      `Last known statuses: ${formatStatusForLog(statuses)}`,
      `Retry: ${retryCommand}`,
    ].join('\n')
  );
}

async function deployMode(timeoutMs: number, intervalMs: number, useProd: boolean) {
  const manifest = await loadManifest();
  const idsToRun = deploySet(manifest.entries);
  const required = requiredForAnyNarrow(manifest.entries);

  if (idsToRun.length === 0) {
    throw new Error('No widen migrations defined in migration-guards.json');
  }
  if (required.length === 0) {
    throw new Error('No required migration IDs found for narrow guards');
  }

  await ensureRequiredMigrationsReady({
    idsToRun,
    required,
    timeoutMs,
    intervalMs,
    useProd,
    modeLabel: 'deploy',
  });
}

async function devStrictMode(timeoutMs: number, intervalMs: number) {
  const manifest = await loadManifest();
  const idsToRun = deploySet(manifest.entries);
  const required = requiredForAnyNarrow(manifest.entries);

  if (idsToRun.length === 0) {
    throw new Error('No widen migrations defined in migration-guards.json');
  }
  if (required.length === 0) {
    throw new Error('No required migration IDs found for narrow guards');
  }

  await ensureRequiredMigrationsReady({
    idsToRun,
    required,
    timeoutMs,
    intervalMs,
    useProd: false,
    modeLabel: 'dev-strict',
  });
}

async function staticCheckMode() {
  const manifest = await loadManifest();
  const ids = new Set(manifest.entries.map((entry) => entry.id));
  if (!manifest.entries.some((entry) => entry.phase === 'narrow')) {
    throw new Error('At least one narrow entry is required when schema narrowing is detected');
  }
  for (const entry of manifest.entries) {
    for (const req of entry.requires) {
      if (!ids.has(req)) {
        throw new Error(`Missing required migration id: ${req}`);
      }
    }
  }
  console.log(JSON.stringify({ ok: true, entries: manifest.entries.length }));
}

async function narrowCheckMode(useProd: boolean) {
  const manifest = await loadManifest();
  const required = requiredForAnyNarrow(manifest.entries);
  if (required.length === 0) {
    throw new Error('No required migration IDs found for narrow guards');
  }
  runCmd(cmdFor('migrations:assertReadyForNarrow', { required }, useProd));
  console.log(JSON.stringify({ ok: true, required }));
}

const { mode, timeoutMs, intervalMs, useProd } = parseArgs(process.argv.slice(2));

if (mode === 'deploy') {
  await deployMode(timeoutMs, intervalMs, useProd);
} else if (mode === 'narrow-check') {
  await narrowCheckMode(useProd);
} else if (mode === 'static-check') {
  await staticCheckMode();
} else if (mode === 'dev-strict') {
  await devStrictMode(timeoutMs, intervalMs);
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
