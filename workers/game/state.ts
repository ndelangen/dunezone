import { createHmac } from 'node:crypto';

import { z } from 'zod';

import type { SpawnContents } from '../../src/shared/play/inventory';
import type { DraftMove, TablePiece } from '../../src/shared/play/model';
import { gameSnapshotSchema } from '../../src/shared/play/protocol';
import type { GameSnapshot, PublicCarry } from '../../src/shared/play/protocol';
import { tableCountSchema, tableIdSchema } from '../../src/shared/play/schema';

/** Storage owns the complete bank collection; transport owns only a projected bank. */
export const storedSnapshotSchema = gameSnapshotSchema.omit({ bank: true }).extend({
  factionBanks: z.record(tableIdSchema, tableCountSchema).default({ harkonnen: 0, atreides: 0 }),
});
export type StoredSnapshot = z.infer<typeof storedSnapshotSchema>;

/** Every delivery uses this projection before serialization or delta computation. */
export class RoomProjection {
  private readonly snapshots = new WeakMap<StoredSnapshot, Map<string | undefined, GameSnapshot>>();
  private readonly pieces = new WeakMap<TablePiece, TablePiece>();

  constructor(private readonly secret: string) {}

  private cardId(id: string) {
    return `card-${createHmac('sha256', this.secret).update(id).digest('hex')}`;
  }

  piece(piece: TablePiece): TablePiece {
    if (piece.kind !== 'card') {
      return piece;
    }
    let projected = this.pieces.get(piece);
    if (!projected) {
      projected = {
        ...piece,
        items: piece.items.map((item) => {
          const hidden = !!piece.inventory || !item.faceUp;
          return {
            id: this.cardId(item.id),
            faceUp: !hidden,
            ...(item.artwork
              ? { artwork: hidden ? { back: item.artwork.back, type: item.artwork.type } : item.artwork }
              : {}),
          };
        }),
      };
      this.pieces.set(piece, projected);
    }
    return projected;
  }

  contents(contents: SpawnContents): SpawnContents {
    return { ...contents, pieces: contents.pieces.map((piece) => this.piece(piece)) };
  }

  carries(carries: PublicCarry[]) {
    return carries.map((carry) => ({ ...carry, held: this.piece(carry.held) }));
  }

  draft(draft: DraftMove, snapshot: StoredSnapshot): DraftMove {
    const cards = new Set(
      snapshot.table.pieces
        .filter((piece) => piece.kind === 'card')
        .flatMap((piece) => piece.items.map((item) => item.id))
    );
    const id = (value: string) => (cards.has(value) ? this.cardId(value) : value);
    return {
      ...draft,
      pickedUpItemIds: draft.pickedUpItemIds.map(id),
      withdrawals: draft.withdrawals.map((withdrawal) => ({ ...withdrawal, itemId: id(withdrawal.itemId) })),
    };
  }

  snapshot(snapshot: StoredSnapshot, factionId?: string): GameSnapshot {
    let audiences = this.snapshots.get(snapshot);
    if (!audiences) {
      audiences = new Map();
      this.snapshots.set(snapshot, audiences);
    }
    let projected = audiences.get(factionId);
    if (!projected) {
      const { revision, table, versions, phase, controls, spiceTransfers } = snapshot;
      projected = {
        revision,
        table: { ...table, pieces: table.pieces.map((piece) => this.piece(piece)) },
        versions,
        phase,
        controls: controls && {
          ...controls,
          requests: controls.requests.map((request) => ({ ...request, contents: this.contents(request.contents) })),
        },
        ...(spiceTransfers ? { spiceTransfers } : {}),
        ...(factionId && Object.hasOwn(snapshot.factionBanks, factionId)
          ? { bank: { factionId, balance: snapshot.factionBanks[factionId] } }
          : {}),
      };
      audiences.set(factionId, projected);
    }
    return projected;
  }
}
