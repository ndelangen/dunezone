import type { GameSnapshot, PieceAction } from '@shared/play/protocol';

/** What this viewer's own commands changed at the table, as the soft notices read it (#2981). */
export type OwnChangesView = Readonly<{
  /** The Shipment and Movement order this viewer last dragged, while it waits for the room or once the room took it. */
  movementOrder: readonly string[] | null;
  /** The battles this viewer's own claim completes, while it waits for the room or once the room took it: they made it ready themselves. */
  completedBattles: readonly string[];
}>;

/** How many battles completed by this viewer's own claim are remembered; older battles have long ended. */
const KEPT_BATTLES = 8;

/**
 * Remembers what this viewer's own commands changed, by the room's answer to each, so a notice never tells them what they did themselves.
 * It lives with the connection rather than with the lazily loaded notices, so a change made before they load still counts.
 * A refused command changes nothing, and a dropped connection forgets everything, since the fresh table after it starts afresh.
 */
export class OwnChanges {
  private movementSent: { commandId: string; order: string[] } | null = null;
  private movementTaken: string[] | null = null;
  /* Claims that would complete their battle, by the command that sent them. */
  private claimsSent = new Map<string, string>();
  private completed: string[] = [];
  private shown: OwnChangesView = { movementOrder: null, completedBattles: [] };

  /** Notes a command as it leaves, against the room's table it was sent to. */
  sent(commandId: string, action: PieceAction, snapshot: GameSnapshot) {
    if (action.kind === 'movement-order') {
      this.movementSent = { commandId, order: action.order };
    } else if (action.kind === 'battle-claim') {
      const battle = snapshot.battle?.id === action.battleId ? snapshot.battle : undefined;
      if (battle?.sides[action.side === 0 ? 1 : 0]) {
        this.claimsSent.set(commandId, action.battleId);
      }
    }
    this.refresh();
  }

  /** Takes the room's answer to a command. */
  settled(commandId: string, outcome: 'completed' | 'rejected') {
    if (this.movementSent?.commandId === commandId) {
      if (outcome === 'completed') {
        this.movementTaken = this.movementSent.order;
      }
      this.movementSent = null;
    }
    const battle = this.claimsSent.get(commandId);
    if (battle !== undefined) {
      this.claimsSent.delete(commandId);
      if (outcome === 'completed') {
        this.completed = [...this.completed.filter((id) => id !== battle), battle].slice(-KEPT_BATTLES);
      }
    }
    this.refresh();
  }

  /** Forgets everything when the connection drops. */
  forget() {
    this.movementSent = null;
    this.movementTaken = null;
    this.claimsSent.clear();
    this.completed = [];
    this.refresh();
  }

  /** The same object until something changes, so the table's projection only changes with it. */
  view(): OwnChangesView {
    return this.shown;
  }

  private refresh() {
    const movementOrder = this.movementSent?.order ?? this.movementTaken;
    const completedBattles = [...this.completed, ...this.claimsSent.values()];
    if (movementOrder !== this.shown.movementOrder || completedBattles.join() !== this.shown.completedBattles.join()) {
      this.shown = { movementOrder, completedBattles };
    }
  }
}
