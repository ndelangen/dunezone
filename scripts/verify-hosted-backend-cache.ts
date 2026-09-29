/**
 * Where the hosted-play launcher keeps the pinned Convex backend archive between runs, and how it names a failed step.
 * A slow download used to fail every run before any flow, because each run fetched the archive again inside a spawn timeout (https://github.com/ndelangen/dunezone/issues/1379).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** The per-user cache directory: `XDG_CACHE_HOME` when set, else `~/.cache`. */
export function backendCacheDirectory(env: NodeJS.ProcessEnv = process.env) {
  return path.join(env.XDG_CACHE_HOME || path.join(env.HOME || homedir(), '.cache'), 'dunezone', 'convex-backend');
}

function sha256(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * The path of the archive whose SHA-256 is `digest`, downloading it only when no verified copy is cached.
 * `download(target)` writes the archive to `target`.
 * The download lands beside the cached name and is renamed only once its digest matches, so an interrupted or corrupt download is never reused.
 * A cached file whose digest differs is removed and fetched again.
 */
export function cachedBackendArchive(options: {
  directory: string;
  digest: string;
  download: (target: string) => void;
}): string {
  const archive = path.join(options.directory, `${options.digest}.zip`);
  if (existsSync(archive)) {
    if (sha256(archive) === options.digest) {
      return archive;
    }
    rmSync(archive, { force: true });
  }
  mkdirSync(options.directory, { recursive: true });
  const partial = `${archive}.${process.pid}.partial`;
  try {
    options.download(partial);
    if (sha256(partial) !== options.digest) {
      throw new Error('Pinned backend archive checksum differs.');
    }
    renameSync(partial, archive);
  } finally {
    rmSync(partial, { force: true });
  }
  return archive;
}

/** Why a synchronous step failed: its own timeout, a signal, an exit code, or the error that kept it from running. */
export function spawnFailure(
  label: string,
  result: { status: number | null; signal: NodeJS.Signals | null; error?: Error & { code?: string } },
  timeoutMs: number
) {
  if (result.error?.code === 'ETIMEDOUT') {
    return `${label} timed out after ${Math.round(timeoutMs / 1000)} s.`;
  }
  if (result.error) {
    return `${label} could not run (${result.error.code ?? result.error.message}).`;
  }
  if (result.status === null) {
    return `${label} was stopped by ${result.signal ?? 'an unknown signal'}.`;
  }
  return `${label} failed (${result.status}).`;
}
