import type { TablePiece } from '@shared/play/model';
import { rearrangeable } from '@shared/play/peeking';
import type { Peek } from '@shared/play/peeking';
import type { GameSnapshot, PieceAction } from '@shared/play/protocol';

import { cachedBy } from './cached';
import type { Cached } from './cached';
import type { TableProjection } from './tableProjection';

type PeekHost = {
  /* The room's live table. */
  snapshot: () => GameSnapshot;
  command: (action: PieceAction) => string | undefined;
  emit: () => void;
};

/* A deck's cards as they stand, by id; the room gives every card a new id whenever it rearranges the deck. */
function deckKey(piece: TablePiece) {
  return piece.items.map((item) => item.id).join(',');
}

/**
 * The deck this viewer holds open: opening, closing, rearranging and pulling from it, with the order it asked for and a close it sent shown before the room answers.
 */
export class PeekState {
  /*
   * The peek this viewer closed, hidden at once while the room confirms it.
   * The room's frame without the peek, a refused close, a dropped connection or asking to peek again each forget it,
   * so a later peek at the same piece, from this tab or another of the faction's, always shows.
   */
  private closed: { pieceId: string; commandId: string } | null = null;
  /* The order this viewer asked for the deck it holds open, shown until the room answers it. */
  private arrangement: { commandId: string; pieceId: string; deck: string; order: number[] } | null = null;
  private closing: Cached<() => void> | undefined;

  constructor(private readonly host: PeekHost) {}

  readonly controls: NonNullable<TableProjection['peekControls']> = {
    peek: (pieceId) => {
      this.closed = null;
      this.host.command({ kind: 'peek', pieceId });
    },
    arrange: (pieceId, order) => this.arrange(pieceId, order),
    pull: (pieceId, index) => this.pull(pieceId, index),
  };

  /* The peek as this viewer sees it. A look back in time shows no peek: what a faction saw then is not what it holds open now. */
  shown(displayed: GameSnapshot, showsHistory: boolean): Peek | null {
    if (showsHistory || displayed.peek?.piece.id === this.closed?.pieceId) {
      return null;
    }
    return this.arranged(displayed.peek ?? null);
  }

  /* The close button for the open peek, the same function while the same deck stays open. */
  closer(pieceId: string) {
    this.closing = cachedBy(this.closing, [pieceId], () => () => this.close(pieceId));
    return this.closing.value;
  }

  settle(commandId: string, outcome: 'completed' | 'rejected') {
    /* A refused close leaves the peek open, so it shows again. */
    if (outcome === 'rejected' && commandId === this.closed?.commandId) {
      this.closed = null;
    }
    /* Refused, the room's order shows again; done, the frame that settles it carries the deck as arranged. */
    if (this.arrangement?.commandId === commandId) {
      this.arrangement = null;
    }
  }

  /* Once the table holds no open peek, the close went through and there is nothing left to hide. */
  forgetSettledClose(room: GameSnapshot | null) {
    if (this.closed && !room?.peek) {
      this.closed = null;
    }
  }

  disconnected() {
    this.arrangement = null;
    this.closed = null;
  }

  /* A close that never went out, as while reconnecting, leaves the peek showing, so its close button still works. */
  private close(pieceId: string) {
    const commandId = this.host.command({ kind: 'peek-close' });
    if (commandId) {
      this.closed = { pieceId, commandId };
      this.host.emit();
    }
  }

  /* Whether the peeked deck still shows the order this viewer asked for: the room has neither refused it nor sent the deck again. */
  private arrangementShown(peek: Peek | null) {
    const pending = this.arrangement;
    return !!peek && pending?.pieceId === peek.piece.id && pending.deck === deckKey(peek.piece);
  }

  private arranged(peek: Peek | null): Peek | null {
    if (!peek || !this.arrangementShown(peek)) {
      return peek;
    }
    const { order } = this.arrangement!;
    return { ...peek, piece: { ...peek.piece, items: order.map((index) => peek.piece.items[index]!) } };
  }

  /* One change to a peeked deck at a time: the next waits for the room's frame, so its places count from the deck as the room holds it. */
  private settled(pieceId: string) {
    const peek = this.host.snapshot().peek ?? null;
    /* A deck over the limit is only looked through: an arrangement of it would be refused before the room reads it. */
    return peek?.piece.id === pieceId && rearrangeable(peek.piece) && !this.arrangementShown(peek) ? peek : null;
  }

  private arrange(pieceId: string, order: number[]) {
    const peek = this.settled(pieceId);
    const commandId = peek && this.host.command({ kind: 'peek-arrange', pieceId, order });
    if (peek && commandId) {
      this.arrangement = { commandId, pieceId, deck: deckKey(peek.piece), order };
      this.host.emit();
    }
  }

  private pull(pieceId: string, index: number) {
    if (this.settled(pieceId)) {
      this.host.command({ kind: 'peek-pull', pieceId, index });
    }
  }
}
