import { lstatSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { privateProbeRoot } from './runtime';

const requiredPath = z.string().min(1);
const reservationOptionsSchema = z.strictObject({
  worktreePath: requiredPath,
  reservationDirectory: requiredPath,
  outputPath: requiredPath,
  behavior: z.enum(['exit', 'hold']),
  releasePath: requiredPath,
  ownerPid: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  port: z.number().int().min(1).max(65_535).optional(),
  timeZone: z.string().optional(),
});
const cleanupOptionsSchema = z.strictObject({
  instancePath: requiredPath,
  reservationDirectory: requiredPath,
  outputPath: requiredPath,
});

export type ReservationWorkerOptions = z.infer<typeof reservationOptionsSchema>;
export type CleanupWorkerOptions = z.infer<typeof cleanupOptionsSchema>;

function parseJsonOptions(encoded: string | undefined, message: string): unknown {
  if (!encoded) {
    throw new Error(message);
  }
  return JSON.parse(encoded);
}

function requireDescendantPath(value: string, directory: string, field: string) {
  if (!path.isAbsolute(value)) {
    throw new Error(`${field} must be an absolute path inside the private isolation probe`);
  }
  const resolved = path.resolve(value);
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`${field} must stay inside the private isolation probe`);
  }
  return resolved;
}

function probeDirectoryFor(reservationDirectory: string) {
  const reservedPath = requireDescendantPath(reservationDirectory, privateProbeRoot, 'reservationDirectory');
  const [probeName] = path.relative(privateProbeRoot, reservedPath).split(path.sep);
  const probeDirectory = path.join(privateProbeRoot, probeName);
  if (!lstatSync(probeDirectory).isDirectory()) {
    throw new Error('The private isolation probe must be an existing directory, not a symbolic link');
  }
  return probeDirectory;
}

function rejectSymbolicLinks(candidate: string, probeDirectory: string, field: string) {
  let current = probeDirectory;
  for (const segment of path.relative(probeDirectory, candidate).split(path.sep)) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`${field} must not pass through a symbolic link`);
    }
  }
}

function requireProbePath(value: string, probeDirectory: string, field: string) {
  const candidate = requireDescendantPath(value, probeDirectory, field);
  rejectSymbolicLinks(candidate, probeDirectory, field);
  return candidate;
}

function requireReservationDirectory(value: string, probeDirectory: string) {
  const directory = requireProbePath(value, probeDirectory, 'reservationDirectory');
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const storagePath = path.join(directory, `reservations.sqlite${suffix}`);
    rejectSymbolicLinks(storagePath, probeDirectory, 'reservationDirectory');
  }
  return directory;
}

export function parseReservationWorkerOptions(encoded: string | undefined): ReservationWorkerOptions {
  const options = reservationOptionsSchema.parse(parseJsonOptions(encoded, 'Incomplete reservation worker arguments'));
  const probeDirectory = probeDirectoryFor(options.reservationDirectory);
  return {
    ...options,
    worktreePath: requireProbePath(options.worktreePath, probeDirectory, 'worktreePath'),
    reservationDirectory: requireReservationDirectory(options.reservationDirectory, probeDirectory),
    outputPath: requireProbePath(options.outputPath, probeDirectory, 'outputPath'),
    releasePath: requireProbePath(options.releasePath, probeDirectory, 'releasePath'),
  };
}

export function parseCleanupWorkerOptions(encoded: string | undefined): CleanupWorkerOptions {
  const options = cleanupOptionsSchema.parse(parseJsonOptions(encoded, 'Incomplete cleanup worker arguments'));
  const probeDirectory = probeDirectoryFor(options.reservationDirectory);
  return {
    instancePath: requireProbePath(options.instancePath, probeDirectory, 'instancePath'),
    reservationDirectory: requireReservationDirectory(options.reservationDirectory, probeDirectory),
    outputPath: requireProbePath(options.outputPath, probeDirectory, 'outputPath'),
  };
}
