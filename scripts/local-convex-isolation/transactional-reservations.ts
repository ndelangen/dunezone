import { resolveLocalDevelopmentInstance } from '../local-dev-instance';
import { readLocalDevelopmentInstanceReservation, stopLocalDevelopmentInstance } from '../local-dev-reservation';
import {
  closeTrackedServer,
  createReservationScenario,
  disposeReservationScenario,
  readExitedScenarioAttempt,
  readScenarioAttempt,
  releaseScenarioWorker,
  startScenarioWorker,
  trackServer,
  worktreePath,
} from './reservation-fixture';
import type { ReservationScenario } from './reservation-fixture';
import { invariant, listenOnLoopback } from './runtime';
import { portsFor, requireSuccessfulAttempt, topologyEnvironment } from './workers';

function findCollidingWorktreePaths(scenario: ReservationScenario): [string, string] {
  const pathByPort = new Map<number, string>();
  for (let index = 0; index <= 5000; index += 1) {
    const candidatePath = worktreePath(scenario, `collision-${index}`);
    const appPort = resolveLocalDevelopmentInstance(candidatePath, {}).appPort;
    const existingPath = pathByPort.get(appPort);
    if (existingPath) {
      return [existingPath, candidatePath];
    }
    pathByPort.set(appPort, candidatePath);
  }
  throw new Error('Could not find two worktree paths with the same preferred port block');
}

async function proveConcurrentCollision(scenario: ReservationScenario) {
  const [firstPath, secondPath] = findCollidingWorktreePaths(scenario);
  invariant(
    resolveLocalDevelopmentInstance(firstPath, {}).appPort === resolveLocalDevelopmentInstance(secondPath, {}).appPort,
    'The collision fixture no longer collides'
  );

  const firstWorker = startScenarioWorker(scenario, 'first', {
    worktreePath: firstPath,
    behavior: 'hold',
  });
  const secondWorker = startScenarioWorker(scenario, 'second', {
    worktreePath: secondPath,
    behavior: 'hold',
  });
  const [firstAttempt, secondAttempt] = await Promise.all([
    readScenarioAttempt(firstWorker),
    readScenarioAttempt(secondWorker),
  ]);
  const firstInstance = requireSuccessfulAttempt(firstAttempt, 'First colliding worktree failed');
  const secondInstance = requireSuccessfulAttempt(secondAttempt, 'Second colliding worktree failed');
  invariant(
    portsFor(firstInstance).every((port) => !portsFor(secondInstance).includes(port)),
    'Concurrent colliding worktrees received overlapping ports'
  );

  const explicitWorker = startScenarioWorker(scenario, 'explicit', {
    worktreePath: worktreePath(scenario, 'explicit'),
    behavior: 'exit',
    port: firstInstance.appPort,
  });
  const explicitAttempt = await readExitedScenarioAttempt(explicitWorker);
  invariant(!explicitAttempt.ok, 'An explicitly reserved port was accepted');
  invariant(explicitAttempt.error.includes('reserved by another local worktree'), explicitAttempt.error);

  await Promise.all([releaseScenarioWorker(firstWorker), releaseScenarioWorker(secondWorker)]);
}

async function proveGeneratedPeerShift(scenario: ReservationScenario) {
  const collisionPath = worktreePath(scenario, 'generated-port-collision');
  const preferred = resolveLocalDevelopmentInstance(collisionPath, {});
  const worker = startScenarioWorker(scenario, 'generated-port-collision', {
    worktreePath: collisionPath,
    behavior: 'exit',
    port: preferred.backendPort,
  });
  const instance = requireSuccessfulAttempt(
    await readExitedScenarioAttempt(worker),
    'An explicit port could not move its generated peers'
  );

  invariant(
    instance.appPort === preferred.backendPort,
    'The explicit application port changed while resolving its generated peer collision'
  );
  invariant(
    instance.backendPort !== instance.appPort,
    'A generated backend port still overlaps the explicit application port'
  );
  invariant(
    readLocalDevelopmentInstanceReservation(collisionPath, {}, scenario.reservationDirectory)?.appPort ===
      instance.appPort,
    'Port-independent identity could not read the shifted reservation'
  );
}

async function proveOccupiedPreferredPortShift(scenario: ReservationScenario) {
  const occupiedPath = worktreePath(scenario, 'occupied-preferred');
  const preferred = resolveLocalDevelopmentInstance(occupiedPath, {});
  const listener = trackServer(scenario, await listenOnLoopback(preferred.appPort));
  try {
    const worker = startScenarioWorker(scenario, 'occupied-preferred', {
      worktreePath: occupiedPath,
      behavior: 'exit',
    });
    const instance = requireSuccessfulAttempt(
      await readExitedScenarioAttempt(worker),
      'An occupied generated port blocked automatic allocation'
    );
    invariant(instance.appPort !== preferred.appPort, 'Automatic allocation retained an occupied generated port');
  } finally {
    await closeTrackedServer(scenario, listener);
  }
}

async function proveAbandonedPortReclaim(scenario: ReservationScenario) {
  const staleWorker = startScenarioWorker(scenario, 'foreign-stale', {
    worktreePath: worktreePath(scenario, 'foreign-stale'),
    behavior: 'exit',
  });
  const staleInstance = requireSuccessfulAttempt(
    await readExitedScenarioAttempt(staleWorker),
    'The foreign stale reservation fixture failed'
  );

  const replacementWorker = startScenarioWorker(scenario, 'foreign-replacement', {
    worktreePath: worktreePath(scenario, 'foreign-replacement'),
    behavior: 'hold',
    port: staleInstance.appPort,
  });
  const replacementInstance = requireSuccessfulAttempt(
    await readScenarioAttempt(replacementWorker),
    'An unrelated worktree could not reclaim the abandoned port'
  );
  invariant(
    replacementInstance.appPort === staleInstance.appPort,
    'The unrelated worktree did not reclaim the abandoned port'
  );
  await releaseScenarioWorker(replacementWorker);
}

async function proveSingleStaleTakeover(scenario: ReservationScenario) {
  const stalePath = worktreePath(scenario, 'stale');
  const staleWorker = startScenarioWorker(scenario, 'stale', {
    worktreePath: stalePath,
    behavior: 'exit',
  });
  const staleInstance = requireSuccessfulAttempt(
    await readExitedScenarioAttempt(staleWorker),
    'The stale reservation fixture failed to reserve'
  );

  const firstTakeover = startScenarioWorker(scenario, 'takeover-first', {
    worktreePath: stalePath,
    behavior: 'hold',
  });
  const secondTakeover = startScenarioWorker(scenario, 'takeover-second', {
    worktreePath: stalePath,
    behavior: 'hold',
  });
  const takeoverAttempts = await Promise.all([readScenarioAttempt(firstTakeover), readScenarioAttempt(secondTakeover)]);
  invariant(takeoverAttempts.filter((attempt) => attempt.ok).length === 1, 'Stale takeover produced two owners');
  invariant(
    takeoverAttempts.filter((attempt) => !attempt.ok).length === 1,
    'Stale takeover did not reject the second owner'
  );
  invariant(
    !(await stopLocalDevelopmentInstance(staleInstance, scenario.reservationDirectory, topologyEnvironment())),
    'An old cleanup token claimed the replacement owner'
  );

  const oldReleaseProbe = startScenarioWorker(scenario, 'old-release', {
    worktreePath: stalePath,
    behavior: 'exit',
  });
  const oldReleaseAttempt = await readExitedScenarioAttempt(oldReleaseProbe);
  invariant(!oldReleaseAttempt.ok, 'An old token released the replacement owner');
  invariant(oldReleaseAttempt.error.includes('already running in this worktree'), oldReleaseAttempt.error);

  await Promise.all([releaseScenarioWorker(firstTakeover), releaseScenarioWorker(secondTakeover)]);
}

async function proveCrossTimezoneOwnerIdentity(scenario: ReservationScenario) {
  const fallbackPath = worktreePath(scenario, 'fallback');
  const fallbackWorker = startScenarioWorker(scenario, 'fallback', {
    worktreePath: fallbackPath,
    behavior: 'exit',
    ownerPid: process.pid,
    timeZone: 'America/New_York',
  });
  const fallbackAttempt = await readExitedScenarioAttempt(fallbackWorker);
  invariant(fallbackAttempt.ok, 'The fallback fixture failed to reserve');

  const restartWorker = startScenarioWorker(scenario, 'restart', {
    worktreePath: fallbackPath,
    behavior: 'exit',
    timeZone: 'Europe/Amsterdam',
  });
  const restartAttempt = await readExitedScenarioAttempt(restartWorker);
  invariant(!restartAttempt.ok, 'A replacement started while the fallback owner was still alive');
  invariant(restartAttempt.error.includes('already running in this worktree'), restartAttempt.error);
  invariant(
    readLocalDevelopmentInstanceReservation(fallbackPath, {}, scenario.reservationDirectory),
    'The fallback reservation disappeared before cleanup'
  );
}

export async function proveTransactionalReservations() {
  const scenario = createReservationScenario('reservation-');
  try {
    await proveConcurrentCollision(scenario);
    await proveGeneratedPeerShift(scenario);
    await proveOccupiedPreferredPortShift(scenario);
    await proveAbandonedPortReclaim(scenario);
    await proveSingleStaleTakeover(scenario);
    await proveCrossTimezoneOwnerIdentity(scenario);
    console.log('Concurrent reservation, abandoned cleanup, and cross-timezone ownership checks passed.');
  } finally {
    await disposeReservationScenario(scenario);
  }
}
