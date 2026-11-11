import type { Vector3Tuple } from '@shared/play/model';

type Position = Vector3Tuple | null;

function samePosition(left: Position, right: Position): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

/** Coalesces movement, then sends the latest position once the connection can take it. */
export class TablePointer {
  private position: Position = null;
  private sent: Position = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly send: (position: Position) => boolean,
    private readonly canMove: () => boolean,
    private readonly refreshStationary: boolean
  ) {}

  publish(position: Position) {
    this.position = position;
    if (position === null) {
      clearTimeout(this.timer);
      this.flush();
    } else {
      this.timer ??= setTimeout(this.flush, 50);
    }
  }

  /** The homepage preview still expires hands that stop sending. */
  refresh() {
    if (this.refreshStationary && this.position !== null) {
      this.sendPosition(this.position);
    }
  }

  /** Discards movement waiting to send when the table changes. */
  cancel() {
    this.position = null;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** A new connection, seat or epoch starts with no published hand. */
  forgetSent() {
    this.sent = null;
  }

  private sendPosition(position: Position) {
    if (!this.send(position)) {
      return false;
    }
    this.sent = position;
    return true;
  }

  private readonly flush = () => {
    this.timer = undefined;
    if (samePosition(this.position, this.sent) || this.sendPosition(this.position)) {
      return;
    }
    if (this.position === null || this.refreshStationary) {
      return;
    }
    if (this.canMove()) {
      this.timer = setTimeout(this.flush, 50);
    }
  };
}
