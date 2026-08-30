import { readLocalDevelopmentInstanceReservation } from '../local-dev-reservation';
import type { ReservedLocalDevelopmentInstance } from '../local-dev-reservation';
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
import { portsFor, requireSuccessfulAttempt } from './workers';

const occupiedPortFixtures = [
  { name: 'app', index: 0 },
  { name: 'backend', index: 1 },
  { name: 'site', index: 2 },
  { name: 'dashboard', index: 3 },
] as const;

type OccupiedPortFixture = (typeof occupiedPortFixtures)[number];

type OccupiedPortLease = {
  name: OccupiedPortFixture['name'];
  worktreePath: string;
  instance: ReservedLocalDevelopmentInstance;
  port: number;
};

async function proveOccupiedPortKeepsLease(scenario: ReservationScenario, lease: OccupiedPortLease) {
  const listener = trackServer(scenario, await listenOnLoopback(lease.port));
  try {
    const blockedWorker = startScenarioWorker(scenario, `${lease.name}-blocked`, {
      worktreePath: worktreePath(scenario, `blocked-${lease.name}`),
      behavior: 'exit',
      port: lease.port,
    });
    const blockedAttempt = await readExitedScenarioAttempt(blockedWorker);
    invariant(!blockedAttempt.ok, `The occupied ${lease.name} port was released for reuse`);
    invariant(blockedAttempt.error.includes('reserved by another local worktree'), blockedAttempt.error);

    const retained = readLocalDevelopmentInstanceReservation(lease.worktreePath, {}, scenario.reservationDirectory);
    invariant(
      retained?.reservationToken === lease.instance.reservationToken,
      `The ${lease.name} lease was not restored`
    );
  } finally {
    await closeTrackedServer(scenario, listener);
  }
}

async function provePortCanBeReclaimed(scenario: ReservationScenario, lease: OccupiedPortLease) {
  const retryWorker = startScenarioWorker(scenario, `${lease.name}-retry`, {
    worktreePath: worktreePath(scenario, `retry-${lease.name}`),
    behavior: 'hold',
    port: lease.port,
  });
  const retryInstance = requireSuccessfulAttempt(
    await readScenarioAttempt(retryWorker),
    `The ${lease.name} retry failed`
  );
  invariant(retryInstance.appPort === lease.port, `The ${lease.name} port was not reclaimed after its listener left`);
  await releaseScenarioWorker(retryWorker);
}

async function proveOccupiedPortFixture(scenario: ReservationScenario, fixture: OccupiedPortFixture) {
  const stalePath = worktreePath(scenario, `occupied-${fixture.name}`);
  const staleWorker = startScenarioWorker(scenario, `${fixture.name}-stale`, {
    worktreePath: stalePath,
    behavior: 'exit',
  });
  const staleInstance = requireSuccessfulAttempt(
    await readExitedScenarioAttempt(staleWorker),
    `The ${fixture.name} stale fixture failed`
  );
  const lease: OccupiedPortLease = {
    name: fixture.name,
    worktreePath: stalePath,
    instance: staleInstance,
    port: portsFor(staleInstance)[fixture.index],
  };

  await proveOccupiedPortKeepsLease(scenario, lease);
  await provePortCanBeReclaimed(scenario, lease);
}

export async function proveOccupiedPortsKeepReservations() {
  const scenario = createReservationScenario('occupied-port-');
  try {
    for (const fixture of occupiedPortFixtures) {
      await proveOccupiedPortFixture(scenario, fixture);
    }
    console.log('An abandoned lease remains reserved until every app and Convex port is free.');
  } finally {
    await disposeReservationScenario(scenario);
  }
}
