import type { ProofWakeUp } from './dispatch';
import type { ProofQueueDelivery } from './queue';

export const DEFAULT_LIMIT_EXPERIMENT_CLAIM_KEY = 'proof/default-limit-experiment.claim.json';

export async function acquireDefaultLimitExperimentClaim(
  bucket: R2Bucket,
  wakeUp: ProofWakeUp,
  message: ProofQueueDelivery
): Promise<boolean> {
  const marker = await bucket.put(
    DEFAULT_LIMIT_EXPERIMENT_CLAIM_KEY,
    JSON.stringify({
      schemaVersion: 1,
      messageId: message.id,
      triggerId: wakeUp.triggerId,
      scheduledCutoff: wakeUp.scheduledCutoff,
      claimedAt: new Date().toISOString(),
    }),
    {
      onlyIf: new Headers({ 'if-none-match': '*' }),
      httpMetadata: { contentType: 'application/json' },
    }
  );
  return marker !== null;
}
