import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { resolveLocalDevelopmentInstance } from '../local-dev-instance';
import { reserveLocalDevelopmentInstance, stopLocalDevelopmentInstance } from '../local-dev-reservation';
import type { ReservedLocalDevelopmentInstance } from '../local-dev-reservation';
import { commandEnvironment } from '../provision';
import { delay, isolationEntrypointPath, waitForFile } from './runtime';
import { parseCleanupWorkerOptions, parseReservationWorkerOptions } from './worker-options';
import type { CleanupWorkerOptions, ReservationWorkerOptions } from './worker-options';

export type { ReservationWorkerOptions } from './worker-options';

export type ReservationAttempt =
  | { ok: true; instance: ReservedLocalDevelopmentInstance }
  | { ok: false; error: string };
export type CleanupAttempt = { ok: true; stopped: boolean } | { ok: false; error: string };

export function topologyEnvironment(): NodeJS.ProcessEnv {
  return commandEnvironment(process.env, {
    APP_DEV_PORT: undefined,
    PORT: undefined,
    CONVEX_BACKEND_PORT: undefined,
    CONVEX_SITE_PORT: undefined,
    CONVEX_DASHBOARD_PORT: undefined,
    COMPOSE_PROJECT_NAME: undefined,
    LOCAL_DEV_INSTANCE_ID: undefined,
    LOCAL_DEV_OWNER_PID: undefined,
    LOCAL_DEV_RESERVATION_TOKEN: undefined,
    LOCAL_DEV_DOCKER_PATH: undefined,
    CONVEX_DEPLOY_KEY: undefined,
    CONVEX_DEV_DEPLOY_KEY: undefined,
    CONVEX_PROD_DEPLOY_KEY: undefined,
  });
}

export function portsFor(instance: ReturnType<typeof resolveLocalDevelopmentInstance>) {
  return [instance.appPort, instance.backendPort, instance.sitePort, instance.dashboardPort];
}

function childEnvironment(options: ReservationWorkerOptions) {
  const environment = commandEnvironment(topologyEnvironment(), {
    LOCAL_DEV_OWNER_PID: options.ownerPid ? String(options.ownerPid) : undefined,
  });
  if (options.timeZone) {
    environment.TZ = options.timeZone;
  }
  return environment;
}

export function startReservationWorker(options: ReservationWorkerOptions) {
  return spawn(process.execPath, [isolationEntrypointPath, 'reservation-worker', JSON.stringify(options)], {
    env: childEnvironment(options),
    stdio: 'inherit',
  });
}

export function startCleanupWorker(options: CleanupWorkerOptions, environment: NodeJS.ProcessEnv) {
  return spawn(process.execPath, [isolationEntrypointPath, 'cleanup-worker', JSON.stringify(options)], {
    detached: true,
    env: environment,
    stdio: 'inherit',
  });
}

export function readReservationAttempt(filePath: string): ReservationAttempt {
  return JSON.parse(readFileSync(filePath, 'utf8')) as ReservationAttempt;
}

export function readCleanupAttempt(filePath: string): CleanupAttempt {
  return JSON.parse(readFileSync(filePath, 'utf8')) as CleanupAttempt;
}

export function requireSuccessfulAttempt(attempt: ReservationAttempt, label: string) {
  if (!attempt.ok) {
    throw new Error(`${label}: ${attempt.error}`);
  }
  return attempt.instance;
}

export async function waitForCleanupClaim(options: { claimPath: string; outputPath: string }) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (existsSync(options.claimPath)) {
      return;
    }
    if (existsSync(options.outputPath)) {
      const attempt = readCleanupAttempt(options.outputPath);
      throw new Error(attempt.ok ? 'Cleanup exited before its Docker command ran' : attempt.error);
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${options.claimPath}`);
}

export async function reserveAfterCleanupDrain(options: {
  worktreePath: string;
  environment: NodeJS.ProcessEnv;
  reservationDirectory: string;
}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await reserveLocalDevelopmentInstance(
        options.worktreePath,
        options.environment,
        options.reservationDirectory
      );
    } catch (error) {
      lastError = error;
      if (!isCleanupStillRunningError(error)) {
        throw error;
      }
      await delay(20);
    }
  }
  throw lastError;
}

function isCleanupStillRunningError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('already running') || error.message.includes('could not be cleaned'))
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runReservationWorker(encodedOptions: string | undefined) {
  const options = parseReservationWorkerOptions(encodedOptions);
  const environment = commandEnvironment(topologyEnvironment(), {
    APP_DEV_PORT: options.port === undefined ? undefined : String(options.port),
    LOCAL_DEV_OWNER_PID: process.env.LOCAL_DEV_OWNER_PID,
  });

  let attempt: ReservationAttempt;
  try {
    const instance = await reserveLocalDevelopmentInstance(
      options.worktreePath,
      environment,
      options.reservationDirectory
    );
    attempt = { ok: true, instance };
  } catch (error) {
    attempt = { ok: false, error: errorMessage(error) };
  }
  writeFileSync(options.outputPath, JSON.stringify(attempt));

  if (attempt.ok && options.behavior === 'hold') {
    await waitForFile(options.releasePath, 30_000);
  }
}

export async function runCleanupWorker(encodedOptions: string | undefined) {
  const options = parseCleanupWorkerOptions(encodedOptions);
  const instance = JSON.parse(readFileSync(options.instancePath, 'utf8')) as ReservedLocalDevelopmentInstance;
  let attempt: CleanupAttempt;
  try {
    const stopped = await stopLocalDevelopmentInstance(instance, options.reservationDirectory, process.env);
    attempt = { ok: true, stopped };
  } catch (error) {
    attempt = { ok: false, error: errorMessage(error) };
  }
  writeFileSync(options.outputPath, JSON.stringify(attempt));
}
