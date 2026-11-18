import type { GameSnapshot, PieceAction } from '@shared/play/protocol';

/** One change this viewer's own command made at the table, at the room's revision that confirmed it. */
export type OwnChange = Readonly<
  | { kind: 'movement-order'; order: readonly string[]; revision: number }
  | { kind: 'battle-completed'; battleId: string; revision: number }
>;

/** What this viewer's own commands changed at the table, as the soft notices read it (#2981). */
export type OwnChangesView = Readonly<{
  /** Newest last, each at the revision that confirmed it, so only the change that revision brought counts as the viewer's own. */
  changes: readonly OwnChange[];
}>;

/** How many confirmed changes are remembered; older ones are long behind every table a notice compares. */
const KEPT = 8;

type Sent = Readonly<
  { kind: 'movement-order'; order: readonly string[] } | { kind: 'battle-completed'; battleId: string }
>;

/* A command the room took, waiting for the table that shows it: at once for a view, after the replacement view for a resync. */
type Taken = Readonly<{ sent: Sent; from: number; followsLater: boolean }>;

const sentFor = (action: PieceAction): Sent | null => {
  if (action.kind === 'movement-order') {
    return { kind: 'movement-order', order: action.order };
  }
  return action.kind === 'battle-claim' ? { kind: 'battle-completed', battleId: action.battleId } : null;
};

/*
 * Whether the room's table shows what the command did.
 * A claim only counts once both sides of its battle are filled there, so a claim another player's later claim completed is not the viewer's.
 */
function shows(sent: Sent, snapshot: GameSnapshot): boolean {
  if (sent.kind === 'movement-order') {
    return sent.order.join() === (snapshot.movement?.order ?? []).join();
  }
  const battle = snapshot.battle;
  return battle?.id === sent.battleId && battle.sides.every(Boolean);
}

/*
 * Whether the room's table is the one the command made.
 * A view arrives with it, while the table after a resync only is when the room made no other change since, as each change moves the revision by one.
 * Otherwise another player's change may be in it too, so the command is not credited with what that table shows.
 */
const madeBy = (taken: Taken, snapshot: GameSnapshot) => !taken.followsLater || snapshot.revision === taken.from + 1;

/**
 * Remembers what this viewer's own commands changed, by the room's answer to each and the revision that showed it, so a notice never tells them what they did themselves.
 * It lives with the connection rather than with the lazily loaded notices, so a change made before they load still counts.
 * A refused command changes nothing, and a dropped connection forgets everything, since the fresh table after it starts afresh.
 */
export class OwnChanges {
  private sentCommands = new Map<string, Sent>();
  private taken: Taken[] = [];
  private confirmed: OwnChange[] = [];
  private shown: OwnChangesView = { changes: [] };

  /** Notes a command as it leaves. */
  sent(commandId: string, action: PieceAction) {
    const sent = sentFor(action);
    if (sent) {
      this.sentCommands.set(commandId, sent);
    }
  }

  /**
   * Takes the room's answer to a command, with the room's table as the subscription holds it.
   * A view's answer arrives with its table applied, while a resync's waits for the replacement table.
   */
  settled(
    commandId: string,
    outcome: 'completed' | 'rejected',
    context: Readonly<{ room: GameSnapshot | null; followsLater: boolean }>
  ) {
    const sent = this.sentCommands.get(commandId);
    this.sentCommands.delete(commandId);
    if (sent && outcome === 'completed') {
      this.taken.push({ sent, from: context.room?.revision ?? -1, followsLater: context.followsLater });
      this.observed(context.room);
    }
  }

  /** Reads the room's table as each message leaves it, confirming each taken command at the revision that shows it. */
  observed(snapshot: GameSnapshot | null) {
    if (!snapshot || !this.taken.length) {
      return;
    }
    const waiting: Taken[] = [];
    const confirmed: OwnChange[] = [];
    for (const taken of this.taken) {
      if (taken.followsLater && snapshot.revision <= taken.from) {
        waiting.push(taken);
      } else if (madeBy(taken, snapshot) && shows(taken.sent, snapshot)) {
        confirmed.push({ ...taken.sent, revision: snapshot.revision });
      }
    }
    this.taken = waiting;
    if (confirmed.length) {
      this.confirmed = [...this.confirmed, ...confirmed].slice(-KEPT);
      this.shown = { changes: this.confirmed };
    }
  }

  /** Forgets everything when the connection drops. */
  forget() {
    this.sentCommands.clear();
    this.taken = [];
    if (this.confirmed.length) {
      this.confirmed = [];
      this.shown = { changes: [] };
    }
  }

  /** The same object until something changes, so the table's projection only changes with it. */
  view(): OwnChangesView {
    return this.shown;
  }
}

/** The viewer's own changes the step from one table to the next brought: those confirmed after the first and by the second. */
export const ownChangesBetween = (
  changes: readonly OwnChange[] | undefined,
  before: Readonly<{ revision: number }>,
  after: Readonly<{ revision: number }>
): readonly OwnChange[] =>
  (changes ?? []).filter((change) => change.revision > before.revision && change.revision <= after.revision);

/*
 * What the viewer's own commands did in the step from one table to the next: the battles they completed, and the order they dragged.
 * The order only counts when the viewer's drag made the later table itself, so a step over several revisions never credits an earlier drag with an order someone else restored.
 */
export function ownStep(
  changes: readonly OwnChange[] | undefined,
  before: Readonly<{ revision: number }>,
  after: Readonly<{ revision: number }>
) {
  const step = ownChangesBetween(changes, before, after);
  const last = step.findLast((change) => change.revision === after.revision && change.kind === 'movement-order');
  return {
    completed: step.flatMap((change) => (change.kind === 'battle-completed' ? [change.battleId] : [])),
    ownOrder: last?.kind === 'movement-order' ? last.order : null,
  };
}
