import type { SpiceTransfer } from '../../src/shared/play/banks';
import type { ClientMessage, GameSnapshot, Viewer } from '../../src/shared/play/protocol';
import { isSpicePiece } from '../../src/shared/play/spice';

type CommitMessage = Extract<ClientMessage, { type: 'command' | 'drop' }>;

/** Public transfer records persist beside the bank, stack and command receipt in one transaction. */
export class SpiceLedger {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS spice_transfers (revision INTEGER PRIMARY KEY, user_id TEXT, data TEXT NOT NULL)'
    );
  }

  describe(
    before: GameSnapshot,
    next: GameSnapshot,
    message: CommitMessage,
    viewer: Viewer,
    factionId?: string
  ): SpiceTransfer | undefined {
    const record = { revision: next.revision, actor: viewer.displayName };
    if (message.type === 'command') {
      const action = message.action;
      if (action.kind === 'bank-withdraw') {
        return { ...record, kind: 'withdrawal', amount: action.amount, source: factionId!, destination: 'table' };
      }
      if (action.kind === 'bank-collect') {
        const piece = before.table.pieces.find((piece) => piece.id === action.pieceId)!;
        return { ...record, kind: 'collection', amount: piece.items.length, source: 'table', destination: factionId! };
      }
      if (action.kind === 'spice-spawn') {
        return { ...record, kind: 'supply', amount: action.count, source: 'supply', destination: 'table' };
      }
    }
    const total = (snapshot: GameSnapshot) =>
      snapshot.table.pieces.filter(isSpicePiece).reduce((sum, piece) => sum + piece.items.length, 0);
    const disposed = total(before) - total(next);
    return disposed > 0 ? { ...record, kind: 'disposal', amount: disposed, source: 'table' } : undefined;
  }

  record(transfer: SpiceTransfer, userId: string) {
    this.storage.sql.exec(
      'INSERT INTO spice_transfers VALUES(?,?,?)',
      transfer.revision,
      userId,
      JSON.stringify(transfer)
    );
  }

  page(before: number) {
    const rows = this.storage.sql
      .exec<{ data: string }>(
        'SELECT data FROM spice_transfers WHERE revision<? ORDER BY revision DESC LIMIT 21',
        before
      )
      .toArray();
    return { entries: rows.slice(0, 20).map((row) => JSON.parse(row.data) as SpiceTransfer), more: rows.length > 20 };
  }

  deleteActor(userId: string) {
    this.storage.sql.exec(
      "UPDATE spice_transfers SET user_id=NULL, data=json_set(data,'$.actor','[deleted user]') WHERE user_id=?",
      userId
    );
  }

  project<Snapshot extends GameSnapshot>(snapshot: Snapshot): Snapshot {
    if (!snapshot.spiceTransfers?.length) {
      return snapshot;
    }
    return {
      ...snapshot,
      spiceTransfers: snapshot.spiceTransfers.map((transfer) => {
        const row = this.storage.sql
          .exec<{ data: string }>('SELECT data FROM spice_transfers WHERE revision=?', transfer.revision)
          .toArray()[0];
        return row ? (JSON.parse(row.data) as SpiceTransfer) : transfer;
      }),
    };
  }
}
