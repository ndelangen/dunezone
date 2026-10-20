import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ensureLocalAuthUser } from './local-dev-auth';
import { provisionPersistentBackend } from './local-dev-bootstrap';
import { recordLocalDevelopmentCleanup } from './local-dev-cleanup';
import {
  createLocalDevelopmentInstance,
  localDevelopmentEnvironmentOverrides,
  resolveGitCommonDirectory,
  resolveLocalDevelopmentEnvFile,
} from './local-dev-instance';
import {
  assertPersistentDiskBudget,
  createPersistentManifest,
  lockPersistentDirectory,
  newPersistentSecrets,
  readPersistentManifest,
  readPersistentSecrets,
  releasePersistentLock,
  resolvePersistentDirectory,
  writePrivateJson,
} from './local-dev-persistence';
import type { PersistentManifest, PersistentSecrets } from './local-dev-persistence';
import { buildLocalPublisher, startLocalPublisher } from './local-dev-publisher';
import { discardDownloadedSnapshot, githubCli, resolveLocalSnapshot } from './local-snapshot';
import type { LocalSnapshot } from './local-snapshot';
import {
  backendUp,
  composeDown,
  importSnapshotData,
  finishSnapshotData,
  setLocalBackendVariable,
  prepareLocalPublisher,
  commandEnvironment,
  configureLocalAuth,
  loadFixtureData,
  localApplicationEnvironment,
  parseEnvFile,
  pushCode,
  remapOwnershipToLocalUsers,
  remapLocalAuthoringOwnership,
  runMigrationGuards,
  seedLocalFixtureData,
  selfHostedEnvironment,
} from './provision';
import type { SelfHostedDeployment } from './provision';

/**
 * Where a local launch's data comes from: seeded fixtures by default, or the anonymised snapshot when asked for.
 * No launch loads raw production data (#1559).
 */
type LocalData = { kind: 'fixture' } | { kind: 'snapshot'; file: string | null };

/** The data a launch loads, once a requested snapshot is found and checked. */
type LaunchData = { kind: 'fixture' } | { kind: 'snapshot'; snapshot: LocalSnapshot };

type AppDevMode =
  | { kind: 'cloud' }
  | { kind: 'help' }
  | { kind: 'local'; data: LocalData; persistDir?: string; reset?: boolean };

const rootDirectory = path.resolve(import.meta.dirname, '..');
const viteDevRunnerPath = path.join(import.meta.dirname, 'vite-dev-runner.ts');
const localConvexWatcherPath = path.join(import.meta.dirname, 'local-convex-watcher.ts');

function unknownArguments(args: string[]): Error {
  return new Error(`Unknown app:dev argument: ${args.join(' ')}`);
}

function parseLocalData(args: string[]): LocalData {
  let values: { data?: string; 'snapshot-file'?: string; 'persist-dir'?: string; reset?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      options: {
        data: { type: 'string' },
        'snapshot-file': { type: 'string' },
        'persist-dir': { type: 'string' },
        reset: { type: 'boolean' },
      },
    }));
  } catch {
    throw unknownArguments(['--local', ...args]);
  }
  const { data, 'snapshot-file': file } = values;
  if (
    (values['persist-dir'] !== undefined && (data !== 'snapshot' || !path.isAbsolute(values['persist-dir']))) ||
    (values.reset && !values['persist-dir'])
  ) {
    throw unknownArguments(['--local', ...args]);
  }
  switch (true) {
    case data === 'snapshot':
      return { kind: 'snapshot', file: file ?? null };
    case (data ?? 'fixture') === 'fixture' && file === undefined:
      return { kind: 'fixture' };
    default:
      throw unknownArguments(['--local', ...args]);
  }
}

export function parseAppDevMode(args: string[]): AppDevMode {
  /* `app-dev.sh` supervises a launch whose first argument is `--local`, so the data flags come after it. */
  const [first, ...rest] = args;
  switch (true) {
    case first === undefined:
      return { kind: 'cloud' };
    case first === '--local': {
      const data = parseLocalData(rest);
      const { values } = parseArgs({
        args: rest,
        options: {
          data: { type: 'string' },
          'snapshot-file': { type: 'string' },
          'persist-dir': { type: 'string' },
          reset: { type: 'boolean' },
        },
      });
      return {
        kind: 'local',
        data,
        ...(values['persist-dir'] ? { persistDir: values['persist-dir'], reset: values.reset ?? false } : {}),
      };
    }
    case (first === '--help' || first === '-h') && rest.length === 0:
      return { kind: 'help' };
    default:
      throw unknownArguments(args);
  }
}

function requireValue(values: Record<string, string>, key: string, localEnvFile: string) {
  const value = values[key]?.trim();
  if (!value || value === 'replace-me') {
    throw new Error(`Set ${key} in ${localEnvFile}`);
  }
  return value;
}

function localTemporaryDirectory() {
  const configured = process.env.LOCAL_DEV_TEMPORARY_DIRECTORY?.trim();
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error('LOCAL_DEV_TEMPORARY_DIRECTORY must be set to an absolute path');
  }
  return configured;
}

function assertViteStillRuns(processToWatch: ChildProcess) {
  if (!processToWatch.pid || processToWatch.exitCode !== null || processToWatch.signalCode !== null) {
    throw new Error('The Vite development server exited before it became ready');
  }
}

async function waitForOwnedViteUrl(url: string, readyFile: string, expectedPort: number, processToWatch: ChildProcess) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assertViteStillRuns(processToWatch);
    if (existsSync(readyFile)) {
      const marker: unknown = JSON.parse(readFileSync(readyFile, 'utf8'));
      if (
        typeof marker !== 'object' ||
        marker === null ||
        !('pid' in marker) ||
        marker.pid !== processToWatch.pid ||
        !('port' in marker) ||
        marker.port !== expectedPort
      ) {
        throw new Error('The Vite readiness marker does not belong to this launch');
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) }).catch(() => undefined);
      if (response?.ok) {
        assertViteStillRuns(processToWatch);
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The Vite development server did not become ready at ${url}`);
}

function startVite(port: string, env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, ['x', 'vp', 'dev', '--port', port, '--strictPort'], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
}

function startOwnedVite(port: number, readyFile: string, env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, ['--no-env-file', viteDevRunnerPath, String(port), readyFile], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
}

function startLocalConvexWatcher(deployment: SelfHostedDeployment, env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, ['--no-env-file', localConvexWatcherPath], {
    cwd: rootDirectory,
    env: selfHostedEnvironment(localApplicationEnvironment(env), deployment),
    stdio: 'inherit',
  });
}

async function waitForExit(child: ChildProcess) {
  const exitCode = (code: number | null, signal: NodeJS.Signals | null) => {
    if (code !== null) {
      return code;
    }
    return signal ? 128 + osConstants.signals[signal] : 1;
  };
  return await new Promise<number>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => resolve(exitCode(code, signal));
    child.once('error', onError);
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) {
      child.off('error', onError);
      child.off('exit', onExit);
      resolve(exitCode(child.exitCode, child.signalCode));
    }
  });
}

function unexpectedProcessExit(label: string, exitCode: number): never {
  throw new Error(`${label} exited unexpectedly with status ${exitCode}`);
}

async function requireProcessToStayRunning(exit: Promise<number>, label: string) {
  await Promise.race([
    new Promise((resolve) => setTimeout(resolve, 1000)),
    exit.then((exitCode) => unexpectedProcessExit(label, exitCode)),
  ]);
}

function printHelp() {
  console.log(`Usage:
  bun run app:dev                       Start Vite with the configured online Convex deployment.
  bun run app:dev --local               Reset and start this worktree's disposable local Convex,
                                        seed fixture data, and enable two local test accounts.
                                        --data=fixture asks for the same.
  bun run app:dev --local --data=snapshot [--snapshot-file <zip>]
                                        The same with the anonymised production snapshot, which holds
                                        published content only. Without --snapshot-file it downloads the
                                        newest one with the GitHub CLI, and deletes the download once it
                                        is imported.
  bun run app:dev --local --data=snapshot --persist-dir=/absolute/review-directory [--reset]
                                        Initialize or resume a named local environment. Normal stop keeps
                                        data, auth and object stores. --reset replaces only its runtime state.`);
}

async function runCloudDevelopment() {
  const port = process.env.APP_DEV_PORT ?? process.env.PORT ?? '3000';
  const vite = startVite(port, process.env);
  process.exitCode = await waitForExit(vite);
}

async function runLocalDevelopment(requested: LocalData) {
  const commonGitDirectory = resolveGitCommonDirectory(rootDirectory);
  const localEnvFile = resolveLocalDevelopmentEnvFile(rootDirectory, process.env, commonGitDirectory);
  if (!existsSync(localEnvFile)) {
    throw new Error(
      `Missing local credentials file ${localEnvFile}. Copy .env.e2e.local.example or set LOCAL_DEV_ENV_FILE.`
    );
  }
  const values = {
    ...parseEnvFile(readFileSync(localEnvFile, 'utf8')),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
  };
  const ownerEmail = requireValue(values, 'PLAYWRIGHT_USER_A_EMAIL', localEnvFile);
  const collaboratorEmail = requireValue(values, 'PLAYWRIGHT_USER_B_EMAIL', localEnvFile);
  const password = requireValue(values, 'PLAYWRIGHT_USER_PASSWORD', localEnvFile);
  const temporaryDirectory = localTemporaryDirectory();
  /*
   * The snapshot is found and checked before Docker starts, so a missing or refused file stops the launch at once.
   * A download sits in the launch's private temporary directory, which the supervisor deletes when the launch exits, and the import deletes it sooner.
   */
  const data: LaunchData =
    requested.kind === 'snapshot'
      ? {
          kind: 'snapshot',
          snapshot: resolveLocalSnapshot({ snapshotFile: requested.file, temporaryDirectory, github: githubCli }),
        }
      : requested;
  const instance = createLocalDevelopmentInstance(process.env);
  const viteReadyFile = path.join(temporaryDirectory, 'vite-ready.json');

  let vite: ChildProcess | null = null;
  let convexWatcher: ChildProcess | null = null;
  let shuttingDown = false;
  let localEnv = commandEnvironment(values, {
    ...localDevelopmentEnvironmentOverrides(instance),
    E2E_LOCAL_AUTH: 'true',
    VITE_E2E_LOCAL_AUTH: 'true',
    IS_TEST: 'true',
  });
  recordLocalDevelopmentCleanup(temporaryDirectory, localEnv);

  const cleanup = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    vite?.kill('SIGTERM');
    convexWatcher?.kill('SIGTERM');
  };
  const stop = (exitCode: number) => {
    cleanup();
    process.exit(exitCode);
  };
  process.once('SIGINT', () => stop(130));
  process.once('SIGTERM', () => stop(143));
  process.once('exit', cleanup);

  try {
    console.log(`This launch uses Docker Compose project ${instance.composeProjectName}.`);
    console.log(
      `Ports: app ${instance.appPort}, backend ${instance.backendPort}, site ${instance.sitePort}, dashboard ${instance.dashboardPort}.`
    );
    console.log(`Crash cleanup: bun scripts/local-dev-cleanup.ts ${instance.composeProjectName}`);
    console.log(`Private temporary files: ${temporaryDirectory}`);
    console.log('Starting disposable local Convex data. If a port is occupied, stop and retry this command.');
    const deployment: SelfHostedDeployment = await backendUp(localEnv, {
      url: instance.backendUrl,
    });
    localEnv = commandEnvironment(localEnv, {
      CONVEX_SELF_HOSTED_URL: deployment.url,
      CONVEX_SELF_HOSTED_ADMIN_KEY: deployment.adminKey,
    });

    if (data.kind === 'snapshot') {
      try {
        importSnapshotData(deployment, localEnv, data.snapshot.file);
      } finally {
        discardDownloadedSnapshot(data.snapshot);
      }
    }
    console.log('Configuring and deploying the local Convex backend...');
    configureLocalAuth(deployment, localEnv, {
      siteUrl: instance.appUrl,
      artifactsDirectory: temporaryDirectory,
    });
    pushCode(deployment, localEnv);

    switch (data.kind) {
      case 'fixture':
        console.log('Clearing local Convex for fixture data...');
        await loadFixtureData(deployment);
        break;
      case 'snapshot':
        console.log(`Loading the anonymised snapshot ${data.snapshot.file} into local Convex...`);
        finishSnapshotData(deployment, localEnv);
        break;
    }

    console.log('Preparing required local migrations...');
    runMigrationGuards(deployment, localEnv);

    console.log('Starting the app and creating the two local accounts...');
    vite = startOwnedVite(instance.appPort, viteReadyFile, localApplicationEnvironment(localEnv));
    await waitForOwnedViteUrl(instance.appUrl, viteReadyFile, instance.appPort, vite);
    await ensureLocalAuthUser(instance.appUrl, ownerEmail, password);
    await ensureLocalAuthUser(instance.appUrl, collaboratorEmail, password);

    if (data.kind === 'fixture') {
      console.log('Seeding the e2e baseline, the Storybook baseline and the Play catalogues...');
      await seedLocalFixtureData(deployment, localEnv, ownerEmail);
    }
    console.log('Handing factions and groups to the local reviewer accounts...');
    remapOwnershipToLocalUsers(deployment, localEnv, ownerEmail, collaboratorEmail);
    console.log('Watching this worktree for Convex backend changes...');
    convexWatcher = startLocalConvexWatcher(deployment, localEnv);
    const convexWatcherExit = waitForExit(convexWatcher);
    await requireProcessToStayRunning(convexWatcherExit, 'The local Convex watcher');
    console.log(`Local development is ready at ${instance.appUrl}.`);
    console.log(`The local Convex dashboard is at ${instance.dashboardUrl}.`);
    console.log('Sign in with either configured local account.');

    process.exitCode = await Promise.race([
      waitForExit(vite),
      convexWatcherExit.then((exitCode) => unexpectedProcessExit('The local Convex watcher', exitCode)),
    ]);
  } finally {
    cleanup();
  }
}

function readLaunchManifest(stateDirectory: string, reset: boolean) {
  if (!reset) {
    assertPersistentDiskBudget(stateDirectory);
  }
  let manifest = readPersistentManifest(stateDirectory);
  if (reset && manifest) {
    console.log(
      `Resetting only Docker project ${manifest.instance.composeProjectName}, its volume, and ${stateDirectory}.`
    );
    composeDown({ ...process.env, ...localDevelopmentEnvironmentOverrides(manifest.instance) });
    rmSync(stateDirectory, { recursive: true });
    manifest = null;
  }
  if (existsSync(stateDirectory) && !manifest) {
    throw new Error(
      'Persistent runtime state has no manifest. Restore it or inspect and remove only the incomplete runtime directory.'
    );
  }
  if (manifest?.status === 'initializing') {
    throw new Error(
      'The first bootstrap was interrupted. Inspect its manifest, then use explicit --reset to rebuild. No snapshot was reimported.'
    );
  }
  return manifest;
}

function launchCredentials(fresh: boolean, stateDirectory: string) {
  if (!fresh) {
    return { values: process.env, secrets: readPersistentSecrets(stateDirectory) };
  }
  const file = resolveLocalDevelopmentEnvFile(rootDirectory, process.env, resolveGitCommonDirectory(rootDirectory));
  const values = { ...parseEnvFile(readFileSync(file, 'utf8')), ...process.env };
  const secrets = newPersistentSecrets(
    requireValue(values as Record<string, string>, 'PLAYWRIGHT_USER_A_EMAIL', file),
    requireValue(values as Record<string, string>, 'PLAYWRIGHT_USER_B_EMAIL', file),
    requireValue(values as Record<string, string>, 'PLAYWRIGHT_USER_PASSWORD', file)
  );
  return { values, secrets };
}

function persistentServiceEnvironment(
  values: NodeJS.ProcessEnv,
  instance: PersistentManifest['instance'],
  publisherPort: number
) {
  const localEnv = commandEnvironment(values, {
    ...localDevelopmentEnvironmentOverrides(instance),
    E2E_LOCAL_AUTH: 'true',
    VITE_E2E_LOCAL_AUTH: 'true',
    IS_TEST: 'true',
    LOCAL_REVIEW_PUBLISHER_URL: `http://127.0.0.1:${publisherPort}`,
  });
  // Avoid Docker's optional external database/S3 settings inherited from a developer shell.
  for (const key of Object.keys(localEnv)) {
    if (/^(AWS_|S3_|DATABASE_URL$|MYSQL_URL$|POSTGRES_URL$|INSTANCE_)/.test(key)) {
      delete localEnv[key];
    }
  }
  return localEnv;
}

function snapshotProvenance(snapshot: LocalSnapshot) {
  return {
    sha256: createHash('sha256').update(readFileSync(snapshot.file)).digest('hex'),
    runId: snapshot.artifact?.runId ?? null,
    artifactId: snapshot.artifact?.artifactId ?? null,
    createdAt: snapshot.artifact ? new Date(snapshot.artifact.createdAt).toISOString() : null,
  };
}

function preparePersistentLaunch(
  requested: Extract<LocalData, { kind: 'snapshot' }>,
  stateDirectory: string,
  temporaryDirectory: string,
  reset: boolean
) {
  let manifest = readLaunchManifest(stateDirectory, reset);
  const fresh = manifest === null;
  if (!fresh && requested.file !== null) {
    throw new Error('--snapshot-file only applies to first use or explicit --reset. Resume keeps authored data.');
  }
  const sourceCommit = spawnSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  }).stdout.trim();
  const { values, secrets } = launchCredentials(fresh, stateDirectory);
  // Verify/download before creating any backend resources. Resume never resolves a snapshot.
  const snapshot = fresh
    ? resolveLocalSnapshot({ snapshotFile: requested.file, temporaryDirectory, github: githubCli })
    : null;
  manifest ??= createPersistentManifest(stateDirectory, sourceCommit);
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  if (snapshot) {
    manifest.snapshot = snapshotProvenance(snapshot);
  }
  writePrivateJson(path.join(stateDirectory, 'manifest.json'), manifest);
  writePrivateJson(path.join(stateDirectory, 'secrets.json'), secrets);
  const instance = manifest.instance;
  const localEnv = persistentServiceEnvironment(values, instance, manifest.publisherPort);
  return { manifest, secrets, localEnv, fresh, snapshot, sourceCommit };
}

async function waitForLocalPublisher(manifest: PersistentManifest, exited: Promise<number>) {
  const health = `http://127.0.0.1:${manifest.publisherPort}/__asset-publisher/health`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await fetch(health, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (ready?.ok) {
      return;
    }
    await Promise.race([
      new Promise((resolve) => setTimeout(resolve, 1000)),
      exited.then((code) => unexpectedProcessExit('Local publisher', code)),
    ]);
  }
  throw new Error('The local publisher did not become ready');
}

function startPersistentPublicationScheduler(manifest: PersistentManifest) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let refuse!: (error: Error) => void;
  const failure = new Promise<never>((_resolve, reject) => {
    refuse = reject;
  });
  const schedule = async () => {
    try {
      assertPersistentDiskBudget(manifest.stateDirectory);
    } catch (error) {
      refuse(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    try {
      await fetch(`http://127.0.0.1:${manifest.publisherPort}/__scheduled`, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(260_000)]),
      });
    } catch (error) {
      console.error('Local publisher cycle failed:', error instanceof Error ? error.message : error);
    }
    if (!abort.signal.aborted) {
      timer = setTimeout(() => {
        void schedule();
      }, 5000);
    }
  };
  timer = setTimeout(() => {
    void schedule();
  }, 5000);
  return {
    failure,
    stop() {
      abort.abort();
      clearTimeout(timer);
    },
  };
}

async function provisionPersistentReviewers(
  manifest: PersistentManifest,
  secrets: PersistentSecrets,
  deployment: SelfHostedDeployment,
  environment: NodeJS.ProcessEnv
) {
  if (manifest.status === 'ready') {
    return;
  }
  await ensureLocalAuthUser(manifest.instance.appUrl, secrets.ownerEmail, secrets.password);
  await ensureLocalAuthUser(manifest.instance.appUrl, secrets.collaboratorEmail, secrets.password);
  remapOwnershipToLocalUsers(deployment, environment, secrets.ownerEmail, secrets.collaboratorEmail);
  remapLocalAuthoringOwnership(deployment, environment, secrets.ownerEmail);
  manifest.ownershipProvisioning = 'snapshot-placeholder-to-reviewer-a';
}

async function runPersistentDevelopment(requested: LocalData, directory: string, reset: boolean) {
  if (requested.kind !== 'snapshot') {
    throw new Error('Persistent review requires --data=snapshot');
  }
  const canonicalDirectory = resolvePersistentDirectory(directory, rootDirectory);
  const temporaryDirectory = localTemporaryDirectory();
  const lock = lockPersistentDirectory(canonicalDirectory);
  let cleanupRecorded = false;
  let vite: ChildProcess | null = null;
  let watcher: ChildProcess | null = null;
  let publisher: ChildProcess | null = null;
  let scheduler: ReturnType<typeof startPersistentPublicationScheduler> | undefined;
  const cleanup = () => {
    scheduler?.stop();
    vite?.kill('SIGTERM');
    watcher?.kill('SIGTERM');
    publisher?.kill('SIGTERM');
  };
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  try {
    const {
      manifest,
      secrets,
      fresh,
      snapshot,
      sourceCommit,
      localEnv: initialEnvironment,
    } = preparePersistentLaunch(requested, lock.stateDirectory, temporaryDirectory, reset);
    let localEnv = initialEnvironment;
    const instance = manifest.instance;
    recordLocalDevelopmentCleanup(temporaryDirectory, localEnv, lock);
    cleanupRecorded = true;
    console.log(
      `${fresh ? 'Initializing' : 'Resuming'} persistent local review at ${instance.appUrl}. Docker project ${instance.composeProjectName}.`
    );
    console.log(`State: ${lock.stateDirectory}. Ctrl+C stops owned services and retains authored data.`);
    const { deployment, environment } = await provisionPersistentBackend({
      manifest,
      secrets,
      snapshot,
      fresh,
      environment: localEnv,
    });
    localEnv = environment;
    prepareLocalPublisher(deployment, localEnv);
    setLocalBackendVariable(deployment, localEnv, 'ASSET_PUBLISHER_EXECUTOR_SECRET', secrets.executorSecret);
    setLocalBackendVariable(deployment, localEnv, 'USER_IMAGE_PUBLIC_BASE_URL', instance.appUrl);
    setLocalBackendVariable(
      deployment,
      localEnv,
      'USER_IMAGE_INGEST_BASE_URL',
      `http://host.docker.internal:${manifest.publisherPort}`
    );
    buildLocalPublisher(localEnv, lock.stateDirectory);
    publisher = startLocalPublisher(manifest, secrets, localEnv, sourceCommit);
    const publisherExit = waitForExit(publisher);
    await waitForLocalPublisher(manifest, publisherExit);
    const viteReadyFile = path.join(temporaryDirectory, 'vite-ready.json');
    vite = startOwnedVite(instance.appPort, viteReadyFile, localApplicationEnvironment(localEnv));
    await waitForOwnedViteUrl(instance.appUrl, viteReadyFile, instance.appPort, vite);
    await provisionPersistentReviewers(manifest, secrets, deployment, localEnv);
    watcher = startLocalConvexWatcher(deployment, localEnv);
    const watcherExit = waitForExit(watcher);
    await requireProcessToStayRunning(watcherExit, 'The local Convex watcher');
    manifest.status = 'ready';
    manifest.lastSourceCommit = sourceCommit;
    writePrivateJson(path.join(lock.stateDirectory, 'manifest.json'), manifest);
    scheduler = startPersistentPublicationScheduler(manifest);
    console.log(`Persistent local development is ready at ${instance.appUrl}. Dashboard: ${instance.dashboardUrl}.`);
    process.exitCode = await Promise.race([
      scheduler.failure,
      waitForExit(vite),
      watcherExit.then((code) => unexpectedProcessExit('Local Convex watcher', code)),
      publisherExit.then((code) => unexpectedProcessExit('Local publisher', code)),
    ]);
  } finally {
    cleanup();
    // Once recorded, the shell supervisor stops Docker before releasing the lock.
    if (!cleanupRecorded) {
      releasePersistentLock(lock.lockDirectory, lock.owner.nonce);
    }
  }
}

async function main() {
  const mode = parseAppDevMode(process.argv.slice(2));
  switch (mode.kind) {
    case 'help':
      printHelp();
      return;
    case 'local':
      if (mode.persistDir) {
        await runPersistentDevelopment(mode.data, mode.persistDir, mode.reset ?? false);
      } else {
        await runLocalDevelopment(mode.data);
      }
      return;
    case 'cloud':
      await runCloudDevelopment();
      return;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
