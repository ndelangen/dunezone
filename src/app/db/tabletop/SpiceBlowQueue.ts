import type { PieceAction } from '@shared/play/protocol';
import { revealedSpiceBlows } from '@shared/play/spiceBlowPlacement';
import { spiceBlowSpot } from '@shared/play/spiceBlowSpot';

import type { TableProjection } from './tableProjection';

type SpiceBlowHost = {
  /* The table as the last update derived it. */
  table: () => TableProjection | null;
  command: (action: PieceAction) => string | undefined;
  /* Whether a command this page sent still waits for the room's answer. */
  awaiting: (commandId: string) => boolean;
};

/**
 * Placing revealed spice cards' spice in their territories (#2678).
 * The Spice blow command's cards go out one at a time: each once the one before is answered, against the table as it is then, so no card is dropped by the limit on unanswered commands and each finds its spot among the spice placed before it.
 */
export class SpiceBlowQueue {
  private queue: string[] = [];
  private inFlight: string | null = null;

  constructor(private readonly host: SpiceBlowHost) {}

  /* Read when they are shown and when they are used, against the table as it is then, so a placement never uses a stale spot. */
  readonly controls: NonNullable<TableProjection['spiceBlowControls']> = {
    placement: (pieceId) => {
      const placement = this.placement(pieceId);
      return placement && { amount: placement.amount, name: placement.name };
    },
    place: (pieceId) => {
      this.place(pieceId);
    },
    placeAll: () => {
      /* Every revealed spice card on the table, the top card of each pile only, places its spice once, one after another. */
      if (this.inFlight && !this.host.awaiting(this.inFlight)) {
        this.inFlight = null;
      }
      this.queue = revealedSpiceBlows(this.host.table()?.state.pieces ?? []).map(({ pieceId }) => pieceId);
      this.next();
    },
  };

  /* Any answer frees room under the unanswered limit; the next card goes after its frame is applied, so it finds its spot among the spice just placed. */
  settle(commandId: string) {
    if (this.inFlight === commandId) {
      this.inFlight = null;
    }
    this.resume();
  }

  /* A card the table could not take a moment ago goes on once the current update is done. */
  resume() {
    if (this.queue.length) {
      queueMicrotask(() => this.next());
    }
  }

  clear() {
    this.queue = [];
    this.inFlight = null;
  }

  private next() {
    while (!this.inFlight && this.queue.length) {
      const pieceId = this.queue.shift()!;
      if (!this.placement(pieceId)) {
        continue;
      }
      const sent = this.place(pieceId);
      if (!sent) {
        /* The table cannot take it yet, as while a fresh view is on its way; the card waits for the next view. */
        this.queue.unshift(pieceId);
        return;
      }
      this.inFlight = sent;
    }
  }

  /** Sends one card's spice to the spot found for it now, and returns the command's id when it went out. */
  private place(pieceId: string): string | undefined {
    const placement = this.placement(pieceId);
    if (!placement) {
      return undefined;
    }
    const { amount: _amount, ...action } = placement;
    return this.host.command({ kind: 'spice-blow', ...action, position: [...action.position] });
  }

  private placement(pieceId: string) {
    const table = this.host.table();
    if (!table || table.reservedPieceIds.has(pieceId)) {
      return null;
    }
    const piece = table.state.pieces.find((entry) => entry.id === pieceId);
    if (!piece) {
      return null;
    }
    /* A pile someone is carrying is no pile to add to, so it counts as held in place. */
    const pieces = table.state.pieces.map((entry) =>
      table.reservedPieceIds.has(entry.id) ? { ...entry, locked: true } : entry
    );
    return spiceBlowSpot(table.snapshot, pieces, piece);
  }
}
