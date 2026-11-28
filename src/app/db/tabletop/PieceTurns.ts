import { tableHandlingOpen } from '@shared/play/admission';
import { foldedTurns, rotatedPiece } from '@shared/play/commands';
import { gestureBlockReason } from '@shared/play/model';
import type { TablePiece, TableState } from '@shared/play/model';
import type { GameSnapshot, PieceAction, PublicCarry } from '@shared/play/protocol';

/* A turn of a piece at rest in 15° steps, clockwise positive; `released` once the key is up but the turn is still to go out. */
type Turn = { pieceId: string; turns: number; released?: boolean };

type PieceTurnsHost = {
  snapshot: () => GameSnapshot;
  /* The table this page derived last, whose state a turn is tried against. */
  state: () => TableState;
  /* Whether a look back in time shows, which shows the table as it was, without this page's turns. */
  showsHistory: () => boolean;
  /* Whether the table shows its live state and can take a command now. */
  current: () => boolean;
  /* Other players' carries as this page shows them. */
  remoteCarries: () => readonly PublicCarry[];
  command: (action: PieceAction) => string | undefined;
  emit: () => void;
};

/**
 * Turns of pieces at rest.
 * A rotation held on a piece turns it on this page only, and goes out as one command when the key comes up;
 * a sent turn shows until the frame that settles it.
 */
export class PieceTurns {
  private turning: Turn | null = null;
  /* Rotations sent and not yet answered, by command, shown until the frame that settles them. */
  private readonly sent = new Map<string, Turn>();
  /* Sent turns the room has done whose new table is still on its way after a resync; they show until it arrives. */
  private readonly done = new Set<string>();

  constructor(private readonly host: PieceTurnsHost) {}

  /* Whether a turn of this piece is on its way: a piece picks up as the room has it, so it waits for that turn. */
  sending(pieceId: string) {
    return [...this.sent.values()].some((turn) => turn.pieceId === pieceId);
  }

  /* A piece this page is turning shows the turn before the room has it; one the turn no longer fits shows as the room has it. */
  shown(state: TableState, piece: TablePiece) {
    /* A look back in time shows the table as it was, and a piece the room has locked, or a table it has closed, shows as the room has it. */
    const turns = this.host.showsHistory() ? 0 : this.turnsOf(piece.id);
    return turns && this.turnablePiece(piece.id) ? (rotatedPiece(state, piece, turns) ?? piece) : piece;
  }

  /* One step of a held turn on a piece at rest; a turn held on another piece goes out first. */
  step(pieceId: string, direction: -1 | 1) {
    if (this.turning && this.turning.pieceId !== pieceId) {
      this.finish();
    }
    const turns = (this.turning?.turns ?? 0) + direction;
    const piece = this.turnablePiece(pieceId);
    /* A step that would overlap another piece is not taken, as the room would refuse it; the turn so far stays. */
    if (!piece || !rotatedPiece(this.host.state(), piece, foldedTurns(this.turnsOf(pieceId) + direction))) {
      return;
    }
    this.turning = { pieceId, turns };
    this.host.emit();
  }

  /** Sends the held rotation as one command, its net turn folded into half a turn either way; a turn back to where it started sends nothing. */
  finish() {
    const turning = this.turning;
    if (!turning) {
      return;
    }
    /* Let go of while a resync pauses the table, the turn waits for the fresh view instead of being lost. */
    if (!this.host.current()) {
      this.turning = { ...turning, released: true };
      return;
    }
    /* The turn stays shown until the command is out, so the piece never springs back in between. */
    const commandId = this.send(turning);
    this.turning = null;
    if (commandId) {
      this.sent.set(commandId, { pieceId: turning.pieceId, turns: foldedTurns(turning.turns) });
    }
    this.host.emit();
  }

  /* A turn let go of while a resync paused the table goes out with the first current view. */
  flush() {
    if (this.turning?.released && this.host.current()) {
      this.finish();
    }
  }

  settle(commandId: string, viewFollows: boolean) {
    if (viewFollows && this.sent.has(commandId)) {
      this.done.add(commandId);
    } else {
      this.sent.delete(commandId);
    }
  }

  /* A new table arrived, so the turns a resync completed show in it now. */
  viewArrived() {
    for (const id of this.done) {
      this.sent.delete(id);
    }
    this.done.clear();
  }

  clear() {
    this.turning = null;
    this.sent.clear();
    this.done.clear();
  }

  /* The pending turns this page has on a piece, held and sent alike. */
  private turnsOf(pieceId: string) {
    let turns = this.turning?.pieceId === pieceId ? this.turning.turns : 0;
    for (const turn of this.sent.values()) {
      if (turn.pieceId === pieceId) {
        turns += turn.turns;
      }
    }
    return foldedTurns(turns);
  }

  /* The piece as the room last sent it, while the room would let it turn: the table open to handling, the piece present, unlocked and not in another player's hand. */
  private turnablePiece(pieceId: string) {
    const snapshot = this.host.snapshot();
    const piece = tableHandlingOpen(snapshot.stage)
      ? snapshot.table.pieces.find((candidate) => candidate.id === pieceId)
      : undefined;
    if (!piece || gestureBlockReason(piece)) {
      return null;
    }
    /* A piece another player is carrying, as from a deck they draw on, is theirs until they let go. */
    return this.host.remoteCarries().some((carry) => carry.reservedIds.includes(pieceId)) ? null : piece;
  }

  /* A piece locked or taken away while the key was held keeps the turn to itself, since the room would refuse it; a turn back to the start sends nothing. */
  private send({ pieceId, turns: held }: Turn) {
    const turns = foldedTurns(held);
    if (!turns || !this.turnablePiece(pieceId)) {
      return;
    }
    const steps = Math.abs(turns);
    return this.host.command({
      kind: 'rotate',
      pieceId,
      direction: turns > 0 ? 1 : -1,
      ...(steps > 1 ? { steps } : {}),
    });
  }
}
