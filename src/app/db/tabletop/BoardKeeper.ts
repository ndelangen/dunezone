import type { GameSnapshot } from '@shared/play/protocol';

type Board = GameSnapshot['board'];

/* Copies of one board decode to equal data; each copy is compared with the drawn board once. */
const drawnEqualTo = new WeakMap<object, object>();

function sameBoard(received: NonNullable<Board>, drawn: Board) {
  if (received === drawn) {
    return true;
  }
  if (!drawn) {
    return false;
  }
  if (drawnEqualTo.get(received) === drawn) {
    return true;
  }
  const same = JSON.stringify(received) === JSON.stringify(drawn);
  if (same) {
    drawnEqualTo.set(received, drawn);
  }
  return same;
}

/**
 * The board the scene draws.
 * History and reconnect messages decode fresh copies of the same board, which keep the copy already drawn so the scene is not rebuilt.
 */
export class BoardKeeper {
  private drawn: Board;

  /* The board kept from a reload, drawn until a fresh view arrives. */
  restore(board: Board) {
    this.drawn = board;
  }

  /*
   * The snapshot with the board to draw. A different board replaces the drawn one: the homepage and tutorial follow the saved Arrakis,
   * which can change while they are open. A history frame without a board keeps the one drawn; a live frame without one removes it,
   * as the table it shows has none.
   */
  shown(received: GameSnapshot, fromHistory: boolean): GameSnapshot {
    const kept = !received.board ? fromHistory : sameBoard(received.board, this.drawn);
    if (!kept) {
      this.drawn = received.board;
    }
    return received.board === this.drawn ? received : { ...received, board: this.drawn };
  }
}
