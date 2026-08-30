import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';

import { ensureLocalAuthUser } from './local-dev-auth';
import {
  localDevelopmentEnvironmentOverrides,
  localDevelopmentReservationDirectory,
  normalizeConvexDeploymentSelection,
  resolveGitCommonDirectory,
  resolveLocalDevelopmentEnvFile,
  resolveLocalDevelopmentProjectEnvFile,
} from './local-dev-instance';
import type { ReservedLocalDevelopmentInstance } from './local-dev-reservation';
import {
  backendUp,
  cloneProductionData,
  commandEnvironment,
  configureLocalAuth,
  localApplicationEnvironment,
  parseEnvFile,
  pushCode,
  remapOwnershipToLocalUsers,
  selfHostedEnvironment,
} from './provision';
import type { SelfHostedDeployment } from './provision';

type AppDevMode = 'cloud' | 'help' | 'local';

type ViteReadyMarker = {
  pid: number;
  port: number;
};

const rootDirectory = path.resolve(import.meta.dirname, '..');
const viteDevRunnerPath = path.join(import.meta.dirname, 'vite-dev-runner.ts');
const localConvexWatcherPath = path.join(import.meta.dirname, 'local-convex-watcher.ts');

export function parseAppDevMode(args: string[]): AppDevMode {
  if (args.length === 0) {
    return 'cloud';
  }
  if (args.length === 1 && args[0] === '--local') {
    return 'local';
  }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    return 'help';
  }
  throw new Error(`Unknown app:dev argument: ${args.join(' ')}`);
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

function parseViteReadyMarker(contents: string, expectedPid: number, expectedPort: number): ViteReadyMarker {
  let marker: unknown;
  try {
    marker = JSON.parse(contents);
  } catch {
    throw new Error('The Vite readiness marker is not valid JSON');
  }
  if (
    typeof marker !== 'object' ||
    marker === null ||
    !('pid' in marker) ||
    !('port' in marker) ||
    marker.pid !== expectedPid ||
    marker.port !== expectedPort
  ) {
    throw new Error(`The Vite readiness marker does not belong to process ${expectedPid} on port ${expectedPort}`);
  }
  return { pid: marker.pid, port: marker.port };
}

function viteProcessExited(processToWatch: ChildProcess) {
  return processToWatch.exitCode !== null || processToWatch.signalCode !== null;
}

function requireViteProcessId(processToWatch: ChildProcess) {
  if (!processToWatch.pid) {
    throw new Error('The Vite development server did not start');
  }
  return processToWatch.pid;
}

function markerBelongsToVite(readyFile: string, expectedPid: number, expectedPort: number) {
  if (!existsSync(readyFile)) {
    return false;
  }
  parseViteReadyMarker(readFileSync(readyFile, 'utf8'), expectedPid, expectedPort);
  return true;
}

async function urlRespondsSuccessfully(url: string) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

function assertViteStillRuns(processToWatch: ChildProcess) {
  if (viteProcessExited(processToWatch)) {
    throw new Error('The Vite development server exited before it became ready');
  }
}

async function waitForOwnedViteUrl(url: string, readyFile: string, expectedPort: number, processToWatch: ChildProcess) {
  const expectedPid = requireViteProcessId(processToWatch);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assertViteStillRuns(processToWatch);
    const ownsPort = markerBelongsToVite(readyFile, expectedPid, expectedPort);
    if (ownsPort && (await urlRespondsSuccessfully(url))) {
      assertViteStillRuns(processToWatch);
      return;
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
  return spawn(process.execPath, [viteDevRunnerPath, String(port), readyFile], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
}

function startLocalConvexWatcher(deployment: SelfHostedDeployment, env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, [localConvexWatcherPath], {
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
  bun run app:dev          Start Vite with the configured online Convex deployment.
  bun run app:dev --local  Reset and start this worktree's disposable local Convex,
                           clone production data, and enable two local test accounts.`);
}

function runMigrationGuards(env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ['run', './scripts/migration-guards.ts', 'dev-strict', '300000', '2000'], {
    cwd: rootDirectory,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Local migration guards failed');
  }
}

async function runCloudDevelopment() {
  const port = process.env.APP_DEV_PORT ?? process.env.PORT ?? '3000';
  const vite = startVite(port, process.env);
  process.exitCode = await waitForExit(vite);
}

async function runLocalDevelopment() {
  const { reserveLocalDevelopmentInstance } = await import('./local-dev-reservation');
  const commonGitDirectory = resolveGitCommonDirectory(rootDirectory);
  if (!commonGitDirectory) {
    throw new Error('Could not resolve the shared Git directory for local port reservation');
  }
  const localEnvFile = resolveLocalDevelopmentEnvFile(rootDirectory, process.env, commonGitDirectory);
  if (!existsSync(localEnvFile)) {
    throw new Error(
      `Missing local credentials file ${localEnvFile}. Copy .env.e2e.local.example or set LOCAL_DEV_ENV_FILE.`
    );
  }
  const projectEnvFile = resolveLocalDevelopmentProjectEnvFile(rootDirectory, commonGitDirectory);
  const projectValues = existsSync(projectEnvFile) ? parseEnvFile(readFileSync(projectEnvFile, 'utf8')) : {};
  const projectDeployment = normalizeConvexDeploymentSelection(projectValues.CONVEX_DEPLOYMENT);
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
  const reservationDirectory = localDevelopmentReservationDirectory(commonGitDirectory);
  const instance: ReservedLocalDevelopmentInstance = await reserveLocalDevelopmentInstance(
    rootDirectory,
    process.env,
    reservationDirectory,
    { reservationToken: process.env.LOCAL_DEV_RESERVATION_TOKEN }
  );
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
    console.log(`Local instance ${instance.id} uses Docker Compose project ${instance.composeProjectName}.`);
    console.log(
      `Ports: app ${instance.appPort}, backend ${instance.backendPort}, site ${instance.sitePort}, dashboard ${instance.dashboardPort}.`
    );
    console.log('Resetting disposable local Convex data...');
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

    console.log('Cloning production data into local Convex...');
    cloneProductionData(deployment, localEnv, temporaryDirectory);

    console.log('Preparing required local migrations...');
    runMigrationGuards(selfHostedEnvironment(localEnv, deployment));

    console.log('Starting the app and creating the two local accounts...');
    vite = startOwnedVite(instance.appPort, viteReadyFile, localApplicationEnvironment(localEnv));
    await waitForOwnedViteUrl(instance.appUrl, viteReadyFile, instance.appPort, vite);
    await ensureLocalAuthUser(instance.appUrl, ownerEmail, password);
    await ensureLocalAuthUser(instance.appUrl, collaboratorEmail, password);

    console.log('Handing cloned factions and groups to the local reviewer accounts...');
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
  if (mode === 'help') {
    printHelp();
    return;
  }
  if (mode === 'local') {
    await runLocalDevelopment();
    return;
  }
  await runCloudDevelopment();
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
