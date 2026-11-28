import type { GameSnapshot } from '@shared/play/protocol';

/** The Shipment and Movement order this viewer dragged, shown on the live table until the room answers it. */
export class MovementOrder {
  private pending: { commandId: string; order: string[] } | null = null;
  /* The live table shown with that order, one copy per frame and drag, so the projection only changes with them. */
  private shown: { from: GameSnapshot; commandId: string; shown: GameSnapshot } | null = null;

  /* Whether a dragged order shows ahead of the room's answer. */
  get dragged() {
    return this.pending !== null;
  }

  sent(commandId: string, order: string[]) {
    this.pending = { commandId, order };
  }

  /* Refused, the room's order shows again; done, the frame that settles it carries the order as dragged. */
  settle(commandId: string) {
    if (this.pending?.commandId === commandId) {
      this.pending = null;
    }
  }

  forget() {
    this.pending = null;
  }

  /* The live table in the order this viewer last dragged. */
  arranged(snapshot: GameSnapshot): GameSnapshot {
    const pending = this.pending;
    if (!pending) {
      return snapshot;
    }
    if (this.shown?.from !== snapshot || this.shown.commandId !== pending.commandId) {
      const movement = { ...(snapshot.movement ?? { done: [] }), order: pending.order };
      this.shown = { from: snapshot, commandId: pending.commandId, shown: { ...snapshot, movement } };
    }
    return this.shown.shown;
  }
}
