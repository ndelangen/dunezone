import { proveCleanupLabelSweep } from './local-convex-isolation/cleanup-label-sweep';
import { proveCleanupTokenFence } from './local-convex-isolation/cleanup-token-fence';
import { proveDockerIsolation } from './local-convex-isolation/docker-isolation';
import { proveOccupiedPortsKeepReservations } from './local-convex-isolation/occupied-port-reservations';
import { proveTransactionalReservations } from './local-convex-isolation/transactional-reservations';
import { proveOwnedViteReadiness } from './local-convex-isolation/vite-readiness';
import { runCleanupWorker, runReservationWorker } from './local-convex-isolation/workers';
import { proveWrapperSupervision } from './local-convex-isolation/wrapper-supervision';

const focusedScenarios = new Map<string, () => Promise<void>>([
  ['cleanup-label-sweep', proveCleanupLabelSweep],
  ['wrapper-supervision', proveWrapperSupervision],
]);

async function proveLocalConvexIsolation() {
  await proveWrapperSupervision();
  await proveOwnedViteReadiness();
  await proveCleanupTokenFence();
  await proveCleanupLabelSweep();
  await proveOccupiedPortsKeepReservations();
  await proveTransactionalReservations();
  await proveDockerIsolation();
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'reservation-worker') {
    await runReservationWorker(process.argv[3]);
    return;
  }
  if (mode === 'cleanup-worker') {
    await runCleanupWorker(process.argv[3]);
    return;
  }
  const focusedScenario = mode ? focusedScenarios.get(mode) : undefined;
  await (focusedScenario ?? proveLocalConvexIsolation)();
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
