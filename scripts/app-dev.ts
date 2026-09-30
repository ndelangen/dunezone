import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ensureLocalAuthUser } from './local-dev-auth';
import { recordLocalDevelopmentCleanup } from './local-dev-cleanup';
import {
  createLocalDevelopmentInstance,
  localDevelopmentEnvironmentOverrides,
  normalizeConvexDeploymentSelection,
  resolveGitCommonDirectory,
  resolveLocalDevelopmentEnvFile,
  resolveLocalDevelopmentProjectEnvFile,
} from './local-dev-instance';
import { githubCli, resolveLocalSnapshot, snapshotCacheDirectory } from './local-snapshot';
import {
  backendUp,
  cloneProductionData,
  commandEnvironment,
  configureLocalAuth,
  loadFixtureData,
  loadSnapshotData,
  localApplicationEnvironment,
  parseEnvFile,
  pushCode,
  remapOwnershipToLocalUsers,
  runMigrationGuards,
  seedLocalFixtureData,
  selfHostedEnvironment,
} from './provision';
import type { SelfHostedDeployment } from './provision';
import { verifySnapshotFile } from './snapshot-anonymise';

/**
 * Where a local launch's data comes from: seeded fixtures by default, or the anonymised snapshot when asked for.
 * The raw production clone is break-glass only.
 */
type LocalData = { kind: 'fixture' } | { kind: 'snapshot'; file: string | null } | { kind: 'clone-prod' };

type AppDevMode = { kind: 'cloud' } | { kind: 'help' } | { kind: 'local'; data: LocalData };

const rootDirectory = path.resolve(import.meta.dirname, '..');
const viteDevRunnerPath = path.join(import.meta.dirname, 'vite-dev-runner.ts');
const localConvexWatcherPath = path.join(import.meta.dirname, 'local-convex-watcher.ts');

function unknownArguments(args: string[]): Error {
  return new Error(`Unknown app:dev argument: ${args.join(' ')}`);
}

function parseLocalData(args: string[]): LocalData {
  let values: { data?: string; 'snapshot-file'?: string; 'clone-prod'?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      options: { data: { type: 'string' }, 'snapshot-file': { type: 'string' }, 'clone-prod': { type: 'boolean' } },
    }));
  } catch {
    throw unknownArguments(['--local', ...args]);
  }
  const { data, 'snapshot-file': file, 'clone-prod': cloneProd } = values;
  switch (true) {
    case cloneProd === true && data === undefined && file === undefined:
      return { kind: 'clone-prod' };
    case cloneProd === undefined && data === 'snapshot':
      return { kind: 'snapshot', file: file ?? null };
    case cloneProd === undefined && (data ?? 'fixture') === 'fixture' && file === undefined:
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
    case first === '--local':
      return { kind: 'local', data: parseLocalData(rest) };
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
  return spawn(process.execPath, ['x', 'vite', 'dev', '--port', port, '--strictPort'], {
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
                                        newest one with the GitHub CLI and caches it for up to seven days
                                        in ${snapshotCacheDirectory(process.env)}.
  bun run app:dev --local --clone-prod  Break-glass only: a raw production clone, with users, emails,
                                        sign-in accounts and drafts. Needs a Convex CLI login that can
                                        export production.`);
}

async function runCloudDevelopment() {
  const port = process.env.APP_DEV_PORT ?? process.env.PORT ?? '3000';
  const vite = startVite(port, process.env);
  process.exitCode = await waitForExit(vite);
}

/** The Convex project a production clone exports from. A fixture launch never looks it up. */
function cloneProjectDeployment(commonGitDirectory: string | undefined) {
  const projectEnvFile = resolveLocalDevelopmentProjectEnvFile(rootDirectory, commonGitDirectory);
  const projectValues = existsSync(projectEnvFile) ? parseEnvFile(readFileSync(projectEnvFile, 'utf8')) : {};
  return normalizeConvexDeploymentSelection(projectValues.CONVEX_DEPLOYMENT);
}

/** Finds the snapshot and checks it before Docker starts, so a missing or refused file stops the launch at once. */
function localSnapshot(file: string | null): string {
  const snapshotFile = resolveLocalSnapshot({
    snapshotFile: file,
    cacheDirectory: snapshotCacheDirectory(process.env),
    now: Date.now(),
    github: githubCli,
  });
  verifySnapshotFile(snapshotFile);
  return snapshotFile;
}

async function runLocalDevelopment(requested: LocalData) {
  const commonGitDirectory = resolveGitCommonDirectory(rootDirectory);
  const localEnvFile = resolveLocalDevelopmentEnvFile(rootDirectory, process.env, commonGitDirectory);
  if (!existsSync(localEnvFile)) {
    throw new Error(
      `Missing local credentials file ${localEnvFile}. Copy .env.e2e.local.example or set LOCAL_DEV_ENV_FILE.`
    );
  }
  const data =
    requested.kind === 'snapshot' ? { kind: requested.kind, file: localSnapshot(requested.file) } : requested;
  const projectDeployment = data.kind === 'clone-prod' ? cloneProjectDeployment(commonGitDirectory) : undefined;
  const values = {
    ...(projectDeployment ? { CONVEX_DEPLOYMENT: projectDeployment } : {}),
    ...parseEnvFile(readFileSync(localEnvFile, 'utf8')),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
  };
  const ownerEmail = requireValue(values, 'PLAYWRIGHT_USER_A_EMAIL', localEnvFile);
  const collaboratorEmail = requireValue(values, 'PLAYWRIGHT_USER_B_EMAIL', localEnvFile);
  const password = requireValue(values, 'PLAYWRIGHT_USER_PASSWORD', localEnvFile);
  const temporaryDirectory = localTemporaryDirectory();
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

    console.log('Configuring and deploying the local Convex backend...');
    configureLocalAuth(deployment, localEnv, {
      siteUrl: instance.appUrl,
      artifactsDirectory: temporaryDirectory,
    });
    pushCode(deployment, localEnv);

    switch (data.kind) {
      case 'fixture':
        console.log('Clearing local Convex for fixture data...');
        loadFixtureData(deployment, localEnv);
        break;
      case 'snapshot':
        console.log(`Loading the anonymised snapshot ${data.file} into local Convex...`);
        loadSnapshotData(deployment, localEnv, data.file);
        break;
      case 'clone-prod':
        console.log(
          'Break-glass: cloning raw production data into local Convex. It holds users, emails, sign-in accounts and drafts.'
        );
        cloneProductionData(deployment, localEnv, temporaryDirectory);
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
      seedLocalFixtureData(deployment, localEnv, ownerEmail);
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

async function main() {
  const mode = parseAppDevMode(process.argv.slice(2));
  switch (mode.kind) {
    case 'help':
      printHelp();
      return;
    case 'local':
      await runLocalDevelopment(mode.data);
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
