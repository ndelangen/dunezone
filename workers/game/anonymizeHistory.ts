import type { GameSnapshot } from '../../src/shared/play/protocol';
import { applyPatch, diff } from './history';
import type { Patch } from './history';

type Attribution = ReturnType<typeof deletedAttribution>;

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
  return { revisions, retainedRevisions, requests };
}

function scrubEvent(event: GameSnapshot['table']['events'][number], revision: number, attribution: Attribution) {
  /*
   * Every committed command appends one table event and advances one revision.
   * Reset replaces the event window, so its newest event still belongs to snapshot.revision.
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

function scrubSnapshot(snapshot: GameSnapshot, attribution: Attribution): GameSnapshot {
  return {
    ...snapshot,
    table: {
      ...snapshot.table,
      events: snapshot.table.events.map((event, index) => scrubEvent(event, snapshot.revision - index, attribution)),
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
