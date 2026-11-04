import type { CommitMessage, GameSnapshot, Viewer } from '../../src/shared/play/protocol';
import { isSpicePiece } from '../../src/shared/play/spice';
import type { SpiceTransfer } from '../../src/shared/play/spiceReserve';

/** Public transfer records persist beside the spice reserve, stack and command receipt in one transaction. */
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
    factionId?: string,
    /* How much spice the carry being dropped held, for a gift. */
    held = 0
  ): SpiceTransfer | undefined {
    const record = { revision: next.revision, actor: viewer.displayName };
    const bySupplyOrBank =
      message.type === 'command' && commandTransfer(record, message.action, before, next, factionId);
    if (bySupplyOrBank) {
      return bySupplyOrBank;
    }
    /* A payment lands in the receiving faction's spice reserve; a bribe on its bribe pile, still on the table. */
    if (message.type === 'drop' && message.give) {
      const { as, factionId: destination } = message.give;
      return held > 0 ? { ...record, kind: as, amount: held, source: 'table', destination } : undefined;
    }
    const disposed = spiceOnTable(before) - spiceOnTable(next);
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

type TransferRecord = Pick<SpiceTransfer, 'revision' | 'actor'>;
type TableCommand = Extract<CommitMessage, { type: 'command' }>['action'];

/* The spice a command moves between the Spice Bank, a faction's reserve and the table, or undefined for any other command. */
function commandTransfer(
  record: TransferRecord,
  action: TableCommand,
  before: GameSnapshot,
  next: GameSnapshot,
  factionId: string | undefined
): SpiceTransfer | undefined {
  switch (action.kind) {
    case 'bank-withdraw':
      return { ...record, kind: 'withdrawal', amount: action.amount, source: factionId!, destination: 'table' };
    case 'bank-collect': {
      const piece = before.table.pieces.find((candidate) => candidate.id === action.pieceId)!;
      return { ...record, kind: 'collection', amount: piece.items.length, source: 'table', destination: factionId! };
    }
    case 'spice-spawn':
      /* `supply` names the Spice Bank (see CONTEXT.md); the literal is kept for stored transfer records. */
      return { ...record, kind: 'supply', amount: action.count, source: 'supply', destination: 'table' };
    case 'spice-blow': {
      /* A revealed spice card's spice comes out of the Spice Bank too, as much as the card says. */
      const amount = spiceOnTable(next) - spiceOnTable(before);
      return amount > 0 ? { ...record, kind: 'supply', amount, source: 'supply', destination: 'table' } : undefined;
    }
    default:
      return undefined;
  }
}

function spiceOnTable(snapshot: GameSnapshot) {
  return snapshot.table.pieces.filter(isSpicePiece).reduce((sum, piece) => sum + piece.items.length, 0);
}
