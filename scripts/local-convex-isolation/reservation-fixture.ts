import type { ChildProcess } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:net';
import path from 'node:path';

import { closeServer, createTemporaryDirectory, invariant, waitForExit, waitForFile } from './runtime';
import type { ReservationAttempt, ReservationWorkerOptions } from './workers';
import { readReservationAttempt, startReservationWorker } from './workers';

export type ReservationScenario = {
  temporaryDirectory: string;
  reservationDirectory: string;
  children: Set<ChildProcess>;
  servers: Set<Server>;
};

export type ScenarioReservationWorker = {
  label: string;
  child: ChildProcess;
  outputPath: string;
  releasePath: string;
};

type ScenarioWorkerOptions = Omit<ReservationWorkerOptions, 'reservationDirectory' | 'outputPath' | 'releasePath'>;

export function createReservationScenario(prefix: string): ReservationScenario {
  const temporaryDirectory = createTemporaryDirectory(prefix);
  return {
    temporaryDirectory,
    reservationDirectory: path.join(temporaryDirectory, 'reservations'),
    children: new Set(),
    servers: new Set(),
  };
}

export function worktreePath(scenario: ReservationScenario, name: string) {
  return path.join(scenario.temporaryDirectory, 'worktrees', name, 'dunezone');
}

export function startScenarioWorker(
  scenario: ReservationScenario,
  label: string,
  options: ScenarioWorkerOptions
): ScenarioReservationWorker {
  const outputPath = path.join(scenario.temporaryDirectory, `${label}.json`);
  const releasePath = path.join(scenario.temporaryDirectory, `${label}.release`);
  const child = startReservationWorker({
    ...options,
    reservationDirectory: scenario.reservationDirectory,
    outputPath,
    releasePath,
  });
  scenario.children.add(child);
  return { label, child, outputPath, releasePath };
}

export async function readScenarioAttempt(worker: ScenarioReservationWorker): Promise<ReservationAttempt> {
  await waitForFile(worker.outputPath);
  return readReservationAttempt(worker.outputPath);
}

export async function readExitedScenarioAttempt(worker: ScenarioReservationWorker): Promise<ReservationAttempt> {
  const attempt = await readScenarioAttempt(worker);
  invariant((await waitForExit(worker.child)) === 0, `${worker.label} worker did not exit cleanly`);
  return attempt;
}

export async function releaseScenarioWorker(worker: ScenarioReservationWorker) {
  writeFileSync(worker.releasePath, 'release');
  invariant((await waitForExit(worker.child)) === 0, `${worker.label} worker failed to stop`);
}

export function trackServer(scenario: ReservationScenario, server: Server) {
  scenario.servers.add(server);
  return server;
}

export async function closeTrackedServer(scenario: ReservationScenario, server: Server) {
  await closeServer(server);
  scenario.servers.delete(server);
}

export async function disposeReservationScenario(scenario: ReservationScenario) {
  for (const child of scenario.children) {
    child.kill('SIGKILL');
  }
  for (const server of scenario.servers) {
    await closeServer(server);
  }
  rmSync(scenario.temporaryDirectory, { recursive: true, force: true });
}
