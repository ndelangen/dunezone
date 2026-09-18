import type { GameSnapshot } from '../../src/shared/play/protocol';
import { applyPatch, diff } from './history';
import type { Patch } from './history';

type Attribution = ReturnType<typeof deletedAttribution>;

/**
 * The scrub release a room's retained history has been repaired to.
 * Bump it when the scrub learns to repair more, and every room repairs once more at its next cold start.
 * A bump is also the remedy after a rollback to a release older than the deletion-time scrub handled a deletion, since a stamped room does not repair on its own.
 */
export const HISTORY_REPAIR_VERSION = 1;

/** Scrub retained attribution before deleting the receipts that identify its author. */
export function anonymizeHistory(storage: DurableObjectStorage, userId: string | null) {
  const attribution = deletedAttribution(storage, userId);
  rewriteHistory(storage, attribution);
  const current = storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').toArray()[0];
  if (current) {
    storage.sql.exec(
      'UPDATE current_state SET data=? WHERE id=1',
      JSON.stringify(scrubSnapshot(JSON.parse(current.data), attribution))
    );
  }
}

function deletedAttribution(storage: DurableObjectStorage, userId: string | null) {
  const revisions = new Set(
    storage.sql
      .exec<{ revision: number }>(
        "SELECT revision FROM receipts WHERE actor_id=? UNION SELECT revision FROM spice_transfers WHERE user_id=? OR (user_id IS NULL AND json_extract(data,'$.actor')='[deleted user]')",
        userId,
        userId
      )
      .toArray()
      .map((row) => row.revision)
  );
  const retainedRevisions = new Set(
    storage.sql
      .exec<{ revision: number }>('SELECT revision FROM receipts')
      .toArray()
      .map((row) => row.revision)
  );
  const requests = new Set(
    storage.sql
      .exec<{ request_id: string }>(
        'SELECT request_id FROM spawn_requests JOIN actors ON actors.user_id=spawn_requests.user_id WHERE actors.user_id=? OR actors.deleted=1',
        userId
      )
      .toArray()
      .map((row) => row.request_id)
  );
  const resets = storage.sql
    .exec<{ revision: number }>(
      "SELECT revision FROM history WHERE kind='checkpoint' AND json_extract(data,'$.table.nextEventNumber')=2 ORDER BY revision DESC"
    )
    .toArray()
    .map((row) => row.revision);
  return { revisions, retainedRevisions, requests, resets };
}

function scrubEvent(event: GameSnapshot['table']['events'][number], revision: number, attribution: Attribution) {
  /*
   * Receipts identify actors even when two players have the same display name or reuse a seat.
   * Account deletion is the only operation that removes receipts.
   * Missing receipts therefore identify older deletions, including those before the spice ledger.
   */
  if (
    (!attribution.revisions.has(revision) && attribution.retainedRevisions.has(revision)) ||
    !['spice.spawn', 'spice.return'].includes(event.command)
  ) {
    return event;
  }
  const action = event.message.match(/ (?:spawned \d+ spice\.|returned \d+ spice to the supply\.)$/)?.[0];
  return { ...event, message: `[deleted user]${action ?? ''}` };
}

function scrubEvents(snapshot: GameSnapshot, attribution: Attribution) {
  /*
   * Spice events and supply/disposal transfers have the same newest-first order.
   * The twenty-transfer window covers the eight-event window, including across resets.
   * Battle and hand changes advance revisions without adding events, so use the transfer's revision.
   * Unmatched events predate the ledger and advanced one event number per revision since reset.
   * Their event numbers and saved reset revision survive later eventless commands.
   */
  const transfers = snapshot.spiceTransfers?.filter((transfer) => ['supply', 'disposal'].includes(transfer.kind));
  const reset = attribution.resets.find((revision) => revision <= snapshot.revision) ?? 0;
  let transferIndex = 0;
  return snapshot.table.events.map((event) => {
    if (!['spice.spawn', 'spice.return'].includes(event.command)) {
      return event;
    }
    const revision = transfers?.[transferIndex++]?.revision ?? reset + Number(event.id.slice(4)) - 1;
    return scrubEvent(event, revision, attribution);
  });
}

function scrubSnapshot(snapshot: GameSnapshot, attribution: Attribution): GameSnapshot {
  return {
    ...snapshot,
    table: {
      ...snapshot.table,
      events: scrubEvents(snapshot, attribution),
    },
    ...(snapshot.controls && {
      controls: {
        ...snapshot.controls,
        requests: snapshot.controls.requests.map((request) =>
          attribution.requests.has(request.id) ? { ...request, requesterName: '[deleted user]' } : request
        ),
      },
    }),
    ...(snapshot.spiceTransfers && {
      spiceTransfers: snapshot.spiceTransfers.map((transfer) =>
        attribution.revisions.has(transfer.revision) || !attribution.retainedRevisions.has(transfer.revision)
          ? { ...transfer, actor: '[deleted user]' }
          : transfer
      ),
    }),
  };
}

function rewriteHistory(storage: DurableObjectStorage, attribution: Attribution) {
  let original: GameSnapshot;
  let anonymized: GameSnapshot;
  for (const row of storage.sql.exec<{ step: number; kind: string; data: string }>(
    'SELECT step, kind, data FROM history ORDER BY step'
  )) {
    original =
      row.kind === 'checkpoint'
        ? (JSON.parse(row.data) as GameSnapshot)
        : applyPatch(original!, JSON.parse(row.data) as Patch[]);
    const next = scrubSnapshot(original, attribution);
    const data = JSON.stringify(row.kind === 'checkpoint' ? next : diff(anonymized!, next));
    if (data !== row.data) {
      storage.sql.exec(
        'UPDATE history SET data=?, bytes=? WHERE step=?',
        data,
        new TextEncoder().encode(data).byteLength,
        row.step
      );
    }
    anonymized = next;
  }
}
