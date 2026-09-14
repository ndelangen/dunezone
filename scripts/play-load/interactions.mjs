import { distribution } from './measurements.mjs';

/** Correlates whole saved interactions with each recipient's applied durable revision. */
export function interactions(peers) {
  const samples = [];
  const views = new Map();
  const pending = new Set();
  const recipientClass = (peer) => `${peer.browser ? 'browser' : 'protocol'}-${peer.role}`;
  function apply(sample, peer, revision, at) {
    if (sample.revision === undefined || revision < sample.revision || !sample.expected.includes(peer.index)) {
      return;
    }
    sample.appliedAt[peer.index] ??= at;
    if (sample.expected.every((index) => sample.appliedAt[index] !== undefined)) {
      sample.completedAt = Math.max(sample.confirmedAt, ...Object.values(sample.appliedAt));
      pending.delete(sample);
    }
  }
  return {
    begin({ peer, operation, phase, scheduledAt = performance.now(), dispatchedAt = performance.now() }) {
      const sample = {
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
    observe(peer, revision) {
      const at = performance.now();
      const recent = views.get(peer.index) ?? new Map();
      views.set(peer.index, recent);
      if (!recent.has(revision)) {
        recent.set(revision, at);
      }
      if (recent.size > 128) {
        recent.delete(recent.keys().next().value);
      }
      for (const sample of pending) {
        apply(sample, peer, revision, at);
      }
    },
    confirm(sample, revision) {
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
      const summarize = (selected) => ({
        scheduled: selected.length,
        missingConfirmations: selected.filter((sample) => sample.confirmedAt === undefined).length,
        missingCompletions: selected.filter((sample) => sample.completedAt === undefined).length,
        dispatchDelay: distribution(selected.map((sample) => sample.dispatchedAt - sample.scheduledAt)),
        carryAdmission: distribution(
          selected
            .filter((sample) => sample.carryAdmittedAt !== undefined)
            .map((sample) => sample.carryAdmittedAt - sample.carryRequestedAt)
        ),
        savedConfirmation: distribution(
          selected
            .filter((sample) => sample.confirmedAt !== undefined)
            .map((sample) => sample.confirmedAt - sample.commandSentAt)
        ),
        intentToConfirmation: distribution(
          selected
            .filter((sample) => sample.confirmedAt !== undefined)
            .map((sample) => sample.confirmedAt - sample.scheduledAt)
        ),
        fullInteraction: distribution(
          selected
            .filter((sample) => sample.completedAt !== undefined)
            .map((sample) => sample.completedAt - sample.scheduledAt)
        ),
      });
      const measured = rows.filter((sample) => sample.phase === 'measured');
      const perClient = peers.map((peer) => ({
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
                  (sum, peer) => sum + perClient.find((row) => row.peer === peer.index).missing,
                  0
                ),
                fullInteraction: distribution(
                  measured.flatMap((sample) =>
                    selected.flatMap((peer) =>
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
