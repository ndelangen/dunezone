import type { ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CleanupProcessGroup } from '../local-dev-process';
import { readLocalDevelopmentInstanceReservation, reserveLocalDevelopmentInstance } from '../local-dev-reservation';
import type { ReservedLocalDevelopmentInstance } from '../local-dev-reservation';
import { commandEnvironment } from '../provision';
import {
  createTemporaryDirectory,
  invariant,
  processGroupIsAlive,
  processIsAlive,
  waitForExit,
  waitForProcessToStop,
} from './runtime';
import {
  readCleanupAttempt,
  reserveAfterCleanupDrain,
  startCleanupWorker,
  topologyEnvironment,
  waitForCleanupClaim,
} from './workers';

type CleanupFenceFixture = {
  temporaryDirectory: string;
  reservationDirectory: string;
  fakeDockerPath: string;
  instancePath: string;
  cleanupOutputPath: string;
  oldCleanupOutputPath: string;
  dockerCallsPath: string;
  cleanupClaimedPath: string;
  destructiveLeaderPath: string;
  destructiveDescendantPath: string;
  destructiveGroupPath: string;
  cleanupReleasePath: string;
  worktreePath: string;
  cleanupProcessGroups: number[];
};

function fakeDockerScript() {
  return [
    '#!/bin/bash',
    'set -euo pipefail',
    'STATE_DIR="${CLEANUP_PROBE_DIRECTORY:?}"',
    'printf "%s\\n" "$*" >> "$STATE_DIR/docker.calls"',
    'if [[ "${1:-}" == "ps" ]]; then',
    '  if [[ ! -f "$STATE_DIR/cleanup.finished" ]]; then printf "retired-service-container\\n"; fi',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "inspect" ]]; then',
    '  printf \'[{"Config":{"Labels":{"com.docker.compose.project":"%s","com.docker.compose.project.working_dir":"%s","com.docker.compose.project.config_files":"%s/docker-compose.convex-local.yml","com.docker.compose.service":"retired-service"}},"HostConfig":{"PortBindings":{}}}]\\n\' "$COMPOSE_PROJECT_NAME" "$CLEANUP_WORKTREE_PATH" "$CLEANUP_WORKTREE_PATH"',
    '  exit 0',
    'fi',
    'if [[ "${1:-}" == "compose" && ! -f "$STATE_DIR/cleanup.claimed" ]]; then',
    '  printf "%s\\n" "$$" > "$STATE_DIR/destructive-leader.pid"',
    '  ps -p "$$" -o pgid= | tr -d "[:space:]" > "$STATE_DIR/destructive-group.pid"',
    '  (',
    "    trap '' HUP",
    '    : > "$STATE_DIR/destructive-descendant.ready"',
    '    while [[ ! -f "$STATE_DIR/cleanup.release" ]]; do sleep 0.01; done',
    '    : > "$STATE_DIR/cleanup.finished"',
    '  ) &',
    '  printf "%s\\n" "$!" > "$STATE_DIR/destructive-descendant.pid"',
    '  while [[ ! -f "$STATE_DIR/destructive-descendant.ready" ]]; do sleep 0.01; done',
    '  : > "$STATE_DIR/cleanup.claimed"',
    '  exit 0',
    'fi',
    '',
  ].join('\n');
}

function createCleanupFenceFixture(): CleanupFenceFixture {
  const temporaryDirectory = createTemporaryDirectory('cleanup-fence-');
  const fakeBinDirectory = path.join(temporaryDirectory, 'bin');
  const fakeDockerPath = path.join(fakeBinDirectory, 'docker');
  mkdirSync(fakeBinDirectory);
  writeFileSync(fakeDockerPath, fakeDockerScript());
  chmodSync(fakeDockerPath, 0o700);
  return {
    temporaryDirectory,
    reservationDirectory: path.join(temporaryDirectory, 'reservations'),
    fakeDockerPath,
    instancePath: path.join(temporaryDirectory, 'instance.json'),
    cleanupOutputPath: path.join(temporaryDirectory, 'cleanup.json'),
    oldCleanupOutputPath: path.join(temporaryDirectory, 'old-cleanup.json'),
    dockerCallsPath: path.join(temporaryDirectory, 'docker.calls'),
    cleanupClaimedPath: path.join(temporaryDirectory, 'cleanup.claimed'),
    destructiveLeaderPath: path.join(temporaryDirectory, 'destructive-leader.pid'),
    destructiveDescendantPath: path.join(temporaryDirectory, 'destructive-descendant.pid'),
    destructiveGroupPath: path.join(temporaryDirectory, 'destructive-group.pid'),
    cleanupReleasePath: path.join(temporaryDirectory, 'cleanup.release'),
    worktreePath: path.join(temporaryDirectory, 'worktrees', 'cleanup-fence', 'dunezone'),
    cleanupProcessGroups: [],
  };
}

function fixtureEnvironment(fixture: CleanupFenceFixture) {
  return commandEnvironment(topologyEnvironment(), {
    PATH: `${path.dirname(fixture.fakeDockerPath)}:${process.env.PATH ?? ''}`,
    CLEANUP_PROBE_DIRECTORY: fixture.temporaryDirectory,
    CLEANUP_WORKTREE_PATH: fixture.worktreePath,
    LOCAL_DEV_DOCKER_PATH: fixture.fakeDockerPath,
  });
}

function readPid(filePath: string) {
  const pid = Number(readFileSync(filePath, 'utf8').trim());
  invariant(Number.isSafeInteger(pid) && pid > 0, `Cleanup fixture has an invalid process id in ${filePath}`);
  return pid;
}

function trackCleanupWorker(fixture: CleanupFenceFixture, worker: ChildProcess) {
  invariant(worker.pid, 'The cleanup worker has no process group');
  fixture.cleanupProcessGroups.push(worker.pid);
  return worker;
}

async function assertReservationRejected(
  fixture: CleanupFenceFixture,
  environment: NodeJS.ProcessEnv,
  message: string
) {
  let replacementError: unknown;
  try {
    await reserveLocalDevelopmentInstance(fixture.worktreePath, environment, fixture.reservationDirectory);
  } catch (error) {
    replacementError = error;
  }
  invariant(replacementError instanceof Error, message);
  invariant(replacementError.message.includes('already running'), replacementError.message);
}

async function disposeCleanupFenceFixture(fixture: CleanupFenceFixture) {
  writeFileSync(fixture.cleanupReleasePath, 'release');
  if (existsSync(fixture.destructiveGroupPath)) {
    await new CleanupProcessGroup(readPid(fixture.destructiveGroupPath)).terminate();
  }
  for (const processGroupId of fixture.cleanupProcessGroups) {
    await new CleanupProcessGroup(processGroupId).terminate();
  }
  rmSync(fixture.temporaryDirectory, { recursive: true, force: true });
}

async function proveOldTokenCannotReachDocker(
  fixture: CleanupFenceFixture,
  environment: NodeJS.ProcessEnv,
  original: ReservedLocalDevelopmentInstance
) {
  await reserveAfterCleanupDrain({
    worktreePath: fixture.worktreePath,
    environment,
    reservationDirectory: fixture.reservationDirectory,
  });
  const callsBefore = readFileSync(fixture.dockerCallsPath, 'utf8').trim().split('\n').length;
  writeFileSync(fixture.instancePath, JSON.stringify(original));
  const oldCleanup = trackCleanupWorker(
    fixture,
    startCleanupWorker(
      {
        instancePath: fixture.instancePath,
        reservationDirectory: fixture.reservationDirectory,
        outputPath: fixture.oldCleanupOutputPath,
      },
      environment
    )
  );
  invariant((await waitForExit(oldCleanup)) === 0, 'The old cleanup worker failed');
  const attempt = readCleanupAttempt(fixture.oldCleanupOutputPath);
  invariant(attempt.ok && !attempt.stopped, 'An old cleanup token claimed the replacement');
  const callsAfter = readFileSync(fixture.dockerCallsPath, 'utf8').trim().split('\n').length;
  invariant(callsAfter === callsBefore, 'An old cleanup token reached Docker');
}

export async function proveCleanupTokenFence() {
  const fixture = createCleanupFenceFixture();
  const environment = fixtureEnvironment(fixture);

  try {
    const original = await reserveLocalDevelopmentInstance(
      fixture.worktreePath,
      environment,
      fixture.reservationDirectory
    );
    writeFileSync(fixture.instancePath, JSON.stringify(original));
    const cleanup = trackCleanupWorker(
      fixture,
      startCleanupWorker(
        {
          instancePath: fixture.instancePath,
          reservationDirectory: fixture.reservationDirectory,
          outputPath: fixture.cleanupOutputPath,
        },
        environment
      )
    );
    await waitForCleanupClaim({
      claimPath: fixture.cleanupClaimedPath,
      outputPath: fixture.cleanupOutputPath,
    });
    const claimed = readLocalDevelopmentInstanceReservation(
      fixture.worktreePath,
      environment,
      fixture.reservationDirectory
    );
    invariant(claimed, 'The paused cleanup lost its reservation');
    invariant(
      claimed.reservationToken !== original.reservationToken,
      'The paused cleanup did not fence the original owner token'
    );

    const destructiveLeaderPid = readPid(fixture.destructiveLeaderPath);
    const destructiveDescendantPid = readPid(fixture.destructiveDescendantPath);
    const destructiveGroupId = readPid(fixture.destructiveGroupPath);
    await waitForProcessToStop(() => processIsAlive(destructiveLeaderPid));
    invariant(!processIsAlive(destructiveLeaderPid), 'The fake Docker leader did not exit');
    invariant(processIsAlive(destructiveDescendantPid), 'The fake Docker descendant exited before the ownership check');
    invariant(processGroupIsAlive(destructiveGroupId), 'The fake Docker descendant lost its process group');

    await assertReservationRejected(fixture, environment, 'A replacement reserved ports while cleanup was paused');
    invariant(cleanup.pid, 'The cleanup worker has no process group');
    process.kill(cleanup.pid, 'SIGKILL');
    await waitForExit(cleanup);
    await assertReservationRejected(
      fixture,
      environment,
      'A replacement started while the destructive child was alive'
    );

    writeFileSync(fixture.cleanupReleasePath, 'release');
    await waitForProcessToStop(() => processGroupIsAlive(destructiveGroupId));
    invariant(!processGroupIsAlive(destructiveGroupId), 'The destructive cleanup process group did not drain');

    await proveOldTokenCannotReachDocker(fixture, environment, original);
    console.log('Cleanup ownership stays fenced through caller death and after a replacement starts.');
  } finally {
    await disposeCleanupFenceFixture(fixture);
  }
}
