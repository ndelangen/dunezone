import { distribution } from './measurements.ts';
import type { InteractionSample, Phase, Recipient } from './types.ts';

/** Correlates whole saved interactions with each recipient's applied durable revision. */
export function interactions(peers: readonly Recipient[]) {
  const samples: InteractionSample[] = [];
  const views = new Map<number, Map<number, number>>();
  const pending = new Set<InteractionSample>();
  const recipientClass = (peer: Recipient) => `${peer.browser ? 'browser' : 'protocol'}-${peer.role}`;
  function apply(sample: InteractionSample, peer: Recipient, revision: number, at: number) {
    if (!sample.expected.includes(peer.index)) {
      return;
    }
    if (sample.revision === undefined || revision < sample.revision) {
      return;
    }
    sample.appliedAt[peer.index] ??= at;
    if (sample.expected.every((index) => sample.appliedAt[index] !== undefined)) {
      sample.completedAt = Math.max(sample.confirmedAt!, ...Object.values(sample.appliedAt));
      pending.delete(sample);
    }
  }
  return {
    begin({
      peer,
      operation,
      phase,
      scheduledAt = performance.now(),
      dispatchedAt = performance.now(),
    }: {
      peer: Recipient;
      operation: string;
      phase: Phase;
      scheduledAt?: number;
      dispatchedAt?: number;
    }) {
      const sample: InteractionSample = {
        peer: peer.index,
        operation,
        phase,
        scheduledAt,
        dispatchedAt,
        expected: peers.map((recipient) => recipient.index),
        appliedAt: {},
      };
      samples.push(sample);
      return sample;
    },
    observe(peer: Recipient, revision: number) {
      const at = performance.now();
      const recent = views.get(peer.index) ?? new Map<number, number>();
      views.set(peer.index, recent);
      if (!recent.has(revision)) {
        recent.set(revision, at);
      }
      if (recent.size > 128) {
        const oldest = recent.keys().next().value;
        if (oldest !== undefined) {
          recent.delete(oldest);
        }
      }
      for (const sample of pending) {
        apply(sample, peer, revision, at);
      }
    },
    confirm(sample: InteractionSample, revision: number) {
      sample.revision = revision;
      sample.confirmedAt = performance.now();
      pending.add(sample);
      for (const peer of peers) {
        for (const [seenRevision, at] of views.get(peer.index) ?? []) {
          if (seenRevision >= revision) {
            apply(sample, peer, seenRevision, at);
            break;
          }
        }
      }
    },
    outstanding() {
      return [...pending].map((sample) => ({
        revision: sample.revision,
        missingRecipients: sample.expected.filter((index) => sample.appliedAt[index] === undefined),
      }));
    },
    finish() {
      const rows = samples.map((sample) => ({
        ...sample,
        missingRecipients: sample.expected.filter((index) => sample.appliedAt[index] === undefined),
      }));
      const summarize = (selected: InteractionSample[]) => ({
        scheduled: selected.length,
        missingConfirmations: selected.filter((sample) => sample.confirmedAt === undefined).length,
        missingCompletions: selected.filter((sample) => sample.completedAt === undefined).length,
        dispatchDelay: distribution(selected.map((sample) => sample.dispatchedAt - sample.scheduledAt)),
        carryAdmission: distribution(
          selected
            .filter((sample) => sample.carryAdmittedAt !== undefined)
            .map((sample) => sample.carryAdmittedAt! - sample.carryRequestedAt!)
        ),
        savedConfirmation: distribution(
          selected
            .filter((sample) => sample.confirmedAt !== undefined)
            .map((sample) => sample.confirmedAt! - sample.commandSentAt!)
        ),
        intentToConfirmation: distribution(
          selected
            .filter((sample) => sample.confirmedAt !== undefined)
            .map((sample) => sample.confirmedAt! - sample.scheduledAt)
        ),
        fullInteraction: distribution(
          selected
            .filter((sample) => sample.completedAt !== undefined)
            .map((sample) => sample.completedAt! - sample.scheduledAt)
        ),
      });
      const measured = rows.filter((sample) => sample.phase === 'measured');
      const perClient = peers.map((peer: Recipient) => ({
        peer: peer.index,
        recipientClass: recipientClass(peer),
        missing: measured.filter((sample) => sample.appliedAt[peer.index] === undefined).length,
        fullInteraction: distribution(
          measured
            .filter((sample) => sample.appliedAt[peer.index] !== undefined)
            .map((sample) => sample.appliedAt[peer.index] - sample.scheduledAt)
        ),
      }));
      return {
        rows,
        byPhase: Object.fromEntries(
          ['preparation', 'warmup', 'measured'].map((phase) => [
            phase,
            summarize(rows.filter((sample) => sample.phase === phase)),
          ])
        ),
        perClient,
        byRecipientClass: Object.fromEntries(
          [...new Set(peers.map(recipientClass))].map((name) => {
            const selected = peers.filter((peer) => recipientClass(peer) === name);
            return [
              name,
              {
                missing: selected.reduce(
                  (sum, peer) => sum + (perClient.find((row) => row.peer === peer.index)?.missing ?? 0),
                  0
                ),
                fullInteraction: distribution(
                  measured.flatMap((sample) =>
                    selected.flatMap((peer: Recipient) =>
                      sample.appliedAt[peer.index] === undefined
                        ? []
                        : [sample.appliedAt[peer.index] - sample.scheduledAt]
                    )
                  )
                ),
              },
            ];
          })
        ),
      };
    },
  };
}
