import type { GameSnapshot } from '@shared/play/protocol';

/**
 * The turn-overs the scene plays on pieces at rest: each one the room's table shows, by its flip revision, and each flip this page sent that the room has not answered yet.
 */
export class PieceFlips {
  private flipping = new Map<string, number>();
  /* Flip commands sent and not yet answered: the piece each turns over. */
  private readonly pending = new Map<string, string>();

  /* The pieces turning over now, by the flip revision each plays to; a piece with a flip on its way plays to the revision the room last sent. */
  view(snapshot: GameSnapshot): Map<string, number> {
    return new Map([
      ...this.flipping,
      ...[...this.pending.values()].map(
        (id) => [id, snapshot.table.pieces.find((piece) => piece.id === id)?.flipRevision ?? 0] as const
      ),
    ]);
  }

  sent(commandId: string, pieceId: string) {
    this.pending.set(commandId, pieceId);
  }

  settle(commandId: string) {
    this.pending.delete(commandId);
  }

  /* Each piece whose flip revision the new table moved starts turning over; a piece gone from the table stops. */
  accept(snapshot: GameSnapshot, previous: GameSnapshot | undefined) {
    const oldRevisions = new Map(previous?.table.pieces.map((piece) => [piece.id, piece.flipRevision ?? 0]));
    const flips = new Map(this.flipping);
    for (const piece of snapshot.table.pieces) {
      const old = oldRevisions.get(piece.id);
      if (old !== undefined && old !== (piece.flipRevision ?? 0)) {
        flips.set(piece.id, piece.flipRevision ?? 0);
      }
    }
    const present = new Set(snapshot.table.pieces.map((piece) => piece.id));
    this.flipping = new Map([...flips].filter(([id]) => present.has(id)));
  }

  /** The scene finished playing a piece's turn-over; answers whether that ended one this page showed. */
  finish(pieceId: string, revision: number) {
    if (this.flipping.get(pieceId) !== revision) {
      return false;
    }
    this.flipping = new Map(this.flipping);
    this.flipping.delete(pieceId);
    return true;
  }

  clear() {
    this.pending.clear();
    this.flipping = new Map();
  }
}
