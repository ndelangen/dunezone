import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { createLocalDevelopmentInstance } from './local-dev-instance';

const port = z.number().int().min(1).max(65_535);
const instanceSchema = z.object({
  composeProjectName: z.string().regex(/^dunezone-local-[a-f0-9-]{36}$/),
  appPort: port,
  backendPort: port,
  sitePort: port,
  dashboardPort: port,
  appUrl: z.string(),
  backendUrl: z.string(),
  siteUrl: z.string(),
  dashboardUrl: z.string(),
});
const manifestSchema = z.object({
  version: z.literal(1),
  stateDirectory: z.string(),
  status: z.enum(['initializing', 'imported', 'configured', 'seeded', 'provisioned', 'ready']),
  mapUrl: z.literal('https://github.com/ndelangen/dunezone/issues/2357'),
  createdAt: z.string(),
  sourceCommit: z.string(),
  lastSourceCommit: z.string(),
  instance: instanceSchema,
  publisherPort: port,
  ownershipProvisioning: z.literal('snapshot-placeholder-to-reviewer-a').optional(),
  snapshot: z
    .object({
      sha256: z.string(),
      runId: z.number().nullable(),
      artifactId: z.number().nullable(),
      createdAt: z.string().nullable(),
    })
    .nullable(),
});
export type PersistentManifest = z.infer<typeof manifestSchema>;
const secretsSchema = z.object({
  executorSecret: z.string().min(32),
  adminKey: z.string().nullable(),
  ownerEmail: z.string().email(),
  collaboratorEmail: z.string().email(),
  password: z.string().min(1),
});
export type PersistentSecrets = z.infer<typeof secretsSchema>;

export function assertLoopbackUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(`Persistent local services require an explicit http://127.0.0.1 port: ${value}`);
  }
  return url.href.replace(/\/$/, '');
}

export function writePrivateJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, file);
}

/** The lock lives outside resettable state. Cleanup releases it only after stopping owned services. */
export function lockPersistentDirectory(directory: string) {
  if (!path.isAbsolute(directory)) {
    throw new Error('--persist-dir must be an absolute directory outside the worktree');
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stateDirectory = path.join(realpathSync(directory), '.dunezone-runtime');
  const lockDirectory = `${stateDirectory}.lock`;
  const owner = { pid: process.ppid, nonce: randomUUID() };
  if (process.env.LOCAL_DEV_OS_LOCK !== `${stateDirectory}.flock`) {
    throw new Error('Persistent review must run through bun run app:dev so the supervisor holds its OS lock');
  }
  // The OS lock proves every earlier supervisor has stopped, even after a reboot.
  rmSync(lockDirectory, { recursive: true, force: true });
  mkdirSync(lockDirectory, { mode: 0o700 });
  writePrivateJson(path.join(lockDirectory, 'owner.json'), owner);
  return { stateDirectory, lockDirectory, owner };
}

export function releasePersistentLock(lockDirectory: string, nonce: string) {
  if (!existsSync(lockDirectory)) {
    return;
  }
  const current = JSON.parse(readFileSync(path.join(lockDirectory, 'owner.json'), 'utf8')) as { nonce?: string };
  if (current.nonce !== nonce) {
    throw new Error('Persistent lock ownership changed; refusing to remove it');
  }
  rmSync(lockDirectory, { recursive: true });
}

export function readPersistentManifest(stateDirectory: string) {
  const file = path.join(stateDirectory, 'manifest.json');
  if (!existsSync(file)) {
    return null;
  }
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (manifest.stateDirectory !== stateDirectory) {
    throw new Error('Persistent manifest was moved. Restore its original directory.');
  }
  const instance = manifest.instance;
  for (const [url, portValue] of [
    [instance.appUrl, instance.appPort],
    [instance.backendUrl, instance.backendPort],
    [instance.siteUrl, instance.sitePort],
    [instance.dashboardUrl, instance.dashboardPort],
  ] as const) {
    if (assertLoopbackUrl(url) !== `http://127.0.0.1:${portValue}`) {
      throw new Error('Persistent manifest origin does not match its port');
    }
  }
  if (
    new Set([instance.appPort, instance.backendPort, instance.sitePort, instance.dashboardPort, manifest.publisherPort])
      .size !== 5
  ) {
    throw new Error('Persistent service ports overlap');
  }
  return manifest;
}

export function createPersistentManifest(stateDirectory: string, sourceCommit: string): PersistentManifest {
  const instance = createLocalDevelopmentInstance({});
  // Keep publisher separate from the four consecutive application/backend ports.
  const publisherPort = instance.appPort + 4;
  return {
    version: 1,
    stateDirectory,
    status: 'initializing',
    mapUrl: 'https://github.com/ndelangen/dunezone/issues/2357',
    createdAt: new Date().toISOString(),
    sourceCommit,
    lastSourceCommit: sourceCommit,
    instance,
    publisherPort,
    snapshot: null,
  };
}

export function newPersistentSecrets(
  ownerEmail: string,
  collaboratorEmail: string,
  password: string
): PersistentSecrets {
  return { executorSecret: randomBytes(32).toString('hex'), adminKey: null, ownerEmail, collaboratorEmail, password };
}

export function readPersistentSecrets(stateDirectory: string) {
  return secretsSchema.parse(JSON.parse(readFileSync(path.join(stateDirectory, 'secrets.json'), 'utf8')));
}

/** Refuse growth before another bounded publication cycle, keeping all existing bytes for recovery. */
export function assertPersistentDiskBudget(directory: string, maximumBytes = 2 * 1024 ** 3): number {
  if (!existsSync(directory)) {
    return 0;
  }
  let bytes = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Persistent runtime state contains a symbolic link: ${current}`);
    }
    if (stat.isDirectory()) {
      pending.push(...readdirSync(current).map((name) => path.join(current, name)));
    } else {
      bytes += stat.size;
    }
    if (bytes > maximumBytes) {
      throw new Error(
        `Persistent runtime exceeds its ${maximumBytes} byte budget. Collect authored files and inspect local objects/logs before resuming.`
      );
    }
  }
  return bytes;
}
