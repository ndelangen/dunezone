import type { GameSnapshot } from '../../src/shared/play/protocol';
import { applyPatch, diff } from './history';
import type { Patch } from './history';

type Attribution = ReturnType<typeof deletedAttribution>;

/**
 * The scrub release a room's retained history has been repaired to.
 * Bump it when the scrub learns to repair more, and every room repairs once more at its next cold start.
 * A bump is also the remedy after a rollback to a release older than the deletion-time scrub handled a deletion, since a stamped room does not repair on its own.
 */
export const HISTORY_REPAIR_VERSION = 2;

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
  if (attribution.creatorDeleted) {
    storage.sql.exec(
      "UPDATE metadata SET data=json_remove(json_set(data, '$.game.creator.displayName', '[deleted user]'), '$.game.creator.avatarUrl', '$.game.creator.profileSlug') WHERE id=1"
    );
  }
}

function deletedAttribution(storage: DurableObjectStorage, userId: string | null) {
  /* The creator is recorded in the game's metadata, not in a command receipt. */
  const creator = storage.sql
    .exec<{ user_id: string; deleted: number }>(
      "SELECT actors.user_id, actors.deleted FROM metadata JOIN actors ON actors.user_id=json_extract(metadata.data, '$.game.creator.userId') WHERE metadata.id=1"
    )
    .toArray()[0];
  const creatorDeleted = creator !== undefined && (creator.user_id === userId || creator.deleted === 1);
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
  const seatRequests = new Set(
    storage.sql
      .exec<{ request_id: string }>(
        'SELECT request_id FROM seat_requests JOIN actors ON actors.user_id=seat_requests.user_id WHERE actors.user_id=? OR actors.deleted=1',
        userId
      )
      .toArray()
      .map((row) => row.request_id)
  );
  /* Determine winner and its result name the acting account; every deleted account is covered, not only this one. */
  const accounts = new Set(
    storage.sql
      .exec<{ user_id: string }>('SELECT user_id FROM actors WHERE user_id=? OR deleted=1', userId)
      .toArray()
      .map((row) => row.user_id)
  );
  return { revisions, retainedRevisions, requests, seatRequests, creatorDeleted, accounts };
}

/** An act retained with its account, as storage keeps Determine winner and the declared result. */
type Acted = { by: { userId?: string | null; name: string } };

function scrubActed<Value extends Acted | null | undefined>(acted: Value, attribution: Attribution): Value {
  const userId = acted?.by.userId;
  if (!acted || !userId || !attribution.accounts.has(userId)) {
    return acted;
  }
  return { ...acted, by: { ...acted.by, userId: null, name: '[deleted user]' } };
}

function scrubSnapshot(snapshot: GameSnapshot, attribution: Attribution): GameSnapshot {
  return {
    ...snapshot,
    ...(snapshot.ending && { ending: scrubActed(snapshot.ending as Acted & typeof snapshot.ending, attribution) }),
    ...(snapshot.result && { result: scrubActed(snapshot.result as Acted & typeof snapshot.result, attribution) }),
    ...(snapshot.controls && {
      controls: {
        ...snapshot.controls,
        requests: snapshot.controls.requests.map((request) =>
          attribution.requests.has(request.id) ? { ...request, requesterName: '[deleted user]' } : request
        ),
        ...(snapshot.controls.seatRequests && {
          seatRequests: snapshot.controls.seatRequests.map((request) =>
            attribution.seatRequests.has(request.id) ? { ...request, requesterName: '[deleted user]' } : request
          ),
        }),
      },
    }),
    /*
     * Receipts identify actors even when two players have the same display name or reuse a seat.
     * Account deletion is the only operation that removes receipts.
     * Missing receipts therefore identify older deletions, including those before the spice ledger.
     */
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
