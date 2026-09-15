import type { GameSnapshot } from '../../src/shared/play/protocol';
import { applyPatch, diff } from './history';
import type { Patch } from './history';

/** Scrub retained attribution before deleting the receipts that identify its author. */
export function anonymizeHistory(storage: DurableObjectStorage, userId: string | null) {
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
  const scrub = (snapshot: GameSnapshot): GameSnapshot => ({
    ...snapshot,
    table: {
      ...snapshot.table,
      events: snapshot.table.events.map((event, index) => {
        /*
         * Every committed command appends one table event and advances one revision.
         * Reset replaces the event window, so its newest event still belongs to snapshot.revision.
         * Receipts identify actors even when two players have the same display name or reuse a seat.
         * Account deletion is the only operation that removes receipts.
         * Missing receipts therefore identify older deletions, including those before the spice ledger.
         */
        if (
          (!revisions.has(snapshot.revision - index) && retainedRevisions.has(snapshot.revision - index)) ||
          !['spice.spawn', 'spice.return'].includes(event.command)
        ) {
          return event;
        }
        const action = event.message.match(/ (?:spawned \d+ spice\.|returned \d+ spice to the supply\.)$/)?.[0];
        return { ...event, message: `[deleted user]${action ?? ''}` };
      }),
    },
    ...(snapshot.controls && {
      controls: {
        ...snapshot.controls,
        requests: snapshot.controls.requests.map((request) =>
          requests.has(request.id) ? { ...request, requesterName: '[deleted user]' } : request
        ),
      },
    }),
    ...(snapshot.spiceTransfers && {
      spiceTransfers: snapshot.spiceTransfers.map((transfer) =>
        revisions.has(transfer.revision) || !retainedRevisions.has(transfer.revision)
          ? { ...transfer, actor: '[deleted user]' }
          : transfer
      ),
    }),
  });
  let original: GameSnapshot;
  let anonymized: GameSnapshot;
  for (const row of storage.sql.exec<{ step: number; kind: string; data: string }>(
    'SELECT step, kind, data FROM history ORDER BY step'
  )) {
    original =
      row.kind === 'checkpoint'
        ? (JSON.parse(row.data) as GameSnapshot)
        : applyPatch(original!, JSON.parse(row.data) as Patch[]);
    const next = scrub(original);
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
  const current = storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').toArray()[0];
  if (current) {
    storage.sql.exec('UPDATE current_state SET data=? WHERE id=1', JSON.stringify(scrub(JSON.parse(current.data))));
  }
}
