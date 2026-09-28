import type { HostedLoadTarget } from '../../src/shared/play/loadTarget.ts';

/** A target that passes `hostedTargetSchema`, for the loopback rehearsal of the hosted backend and for the hosted tooling's tests. */
export function syntheticHostedTarget(sourceRevision: string) {
  return {
    project: 'norbert-de-langen:dunezone-play-load',
    reference: 'dev/native',
    backendName: 'isolated-load-1105',
    backendOrigin: 'https://isolated-load-1105.eu-west-1.convex.cloud',
    applicationOrigin: 'https://dunezone-play-load-native.ndelangen.workers.dev',
    gameWorker: 'dunezone-game-load-native',
    namespaceId: '1'.repeat(32),
    sourceRevision,
  } satisfies HostedLoadTarget;
}
