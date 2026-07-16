import type { ProofReport } from './core';
import { type ProofWakeUp, parseProofWakeUp } from './dispatch';

const MAX_RECENT_TRIGGER_IDS = 32;

export type ProofQueueDelivery = {
  id: string;
  attempts: number;
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type ProofQueueDisposition = {
  action: 'ack';
  reason: 'completed' | 'failed' | 'invalid' | 'duplicate' | 'busy' | 'exhausted';
};

export type ProofOneShotClaim = (
  wakeUp: ProofWakeUp,
  message: ProofQueueDelivery
) => Promise<boolean>;

export class ProofQueueConsumer {
  private running = false;
  private readonly recentTriggerIds = new Set<string>();

  constructor(
    private readonly log: (event: Record<string, unknown>) => void = (event) =>
      console.log(JSON.stringify(event))
  ) {}

  async consume(
    message: ProofQueueDelivery,
    acquireClaim: ProofOneShotClaim,
    runProof: (wakeUp: ProofWakeUp) => Promise<ProofReport>
  ): Promise<ProofQueueDisposition> {
    let wakeUp: ProofWakeUp;
    try {
      wakeUp = parseProofWakeUp(message.body);
    } catch (error) {
      message.ack();
      this.logDelivery(message, 'ack', 'invalid', undefined, error);
      return { action: 'ack', reason: 'invalid' };
    }

    if (this.recentTriggerIds.has(wakeUp.triggerId)) {
      message.ack();
      this.logDelivery(message, 'ack', 'duplicate', wakeUp);
      return { action: 'ack', reason: 'duplicate' };
    }

    if (this.running) {
      message.ack();
      this.logDelivery(message, 'ack', 'busy', wakeUp);
      return { action: 'ack', reason: 'busy' };
    }

    this.running = true;
    try {
      const acquired = await acquireClaim(wakeUp, message);
      if (!acquired) {
        this.remember(wakeUp.triggerId);
        message.ack();
        this.logDelivery(message, 'ack', 'duplicate', wakeUp);
        return { action: 'ack', reason: 'duplicate' };
      }
      const report = await runProof(wakeUp);
      this.remember(wakeUp.triggerId);
      message.ack();
      const reason = report.outcome === 'success' ? 'completed' : 'failed';
      this.logDelivery(message, 'ack', reason, wakeUp, undefined, report);
      return { action: 'ack', reason };
    } catch (error) {
      message.ack();
      this.logDelivery(message, 'ack', 'exhausted', wakeUp, error);
      return { action: 'ack', reason: 'exhausted' };
    } finally {
      this.running = false;
    }
  }

  private remember(triggerId: string): void {
    this.recentTriggerIds.add(triggerId);
    while (this.recentTriggerIds.size > MAX_RECENT_TRIGGER_IDS) {
      const oldest = this.recentTriggerIds.values().next().value;
      if (oldest === undefined) break;
      this.recentTriggerIds.delete(oldest);
    }
  }

  private logDelivery(
    message: ProofQueueDelivery,
    action: 'ack',
    reason: ProofQueueDisposition['reason'],
    wakeUp?: ProofWakeUp,
    error?: unknown,
    report?: ProofReport
  ): void {
    this.log({
      event: 'asset_publishing_proof_queue_delivery',
      messageId: message.id,
      attempts: message.attempts,
      action,
      reason,
      ...(wakeUp ? { triggerId: wakeUp.triggerId, scheduledCutoff: wakeUp.scheduledCutoff } : {}),
      ...(report ? { report } : {}),
      ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
    });
  }
}
