import type { BattlePlan, BattlePlanInput, Disclosure } from '@shared/play/battle';
import type { GameSnapshot, PieceAction } from '@shared/play/protocol';

type BattleAction = Extract<PieceAction, { kind: 'battle-ready' | 'battle-disclose' }>;
type Disclose = Extract<PieceAction, { kind: 'battle-disclose' }>;

/* Readiness and reveals wait behind plan edits, so the room judges them on the plan the player sees. */
function waitsForPlan(action: PieceAction): action is BattleAction {
  return action.kind === 'battle-ready' || action.kind === 'battle-disclose';
}

/* The part a battle action reveals in the given battle, if it reveals one. */
function revealIn(action: PieceAction, battleId?: string): Disclosure[] {
  return action.kind === 'battle-disclose' && action.shown && action.battleId === battleId ? [action.disclosure] : [];
}

function shownWith(shown: BattlePlan['disclosed'], disclosure: Disclosure): BattlePlan['disclosed'] {
  return disclosure.element === 'card'
    ? { ...shown, cardIds: [...new Set([...shown.cardIds, disclosure.cardId])] }
    : { ...shown, [disclosure.element]: true };
}

/* The snapshot with its battle plan replaced, the bank holding back the spice the new plan commits. */
function withPlan(snapshot: GameSnapshot, was: BattlePlan, plan: BattlePlan): GameSnapshot {
  const bank = snapshot.bank && {
    ...snapshot.bank,
    balance: snapshot.bank.balance + was.spice - plan.spice,
  };
  return { ...snapshot, battlePlan: plan, ...(bank ? { bank } : {}) };
}

/** What the battle queue needs from its table session. */
export type BattleQueueTable = {
  canAct(): boolean;
  snapshot(): GameSnapshot;
  /** Sends a plan edit; the queue holds every later edit until the room answers it. */
  sendPlan(commandId: string, battleId: string, plan: BattlePlanInput, expectedRevision: number): void;
  /** Sends a queued battle action through the session's own command path. */
  command(action: BattleAction): void;
  /** Whether the session may have one more command waiting on the room. */
  hasRoom(): boolean;
};

/**
 * The battle plan's optimistic commands: edits merge while one is on its way, and readiness and reveals queue behind them.
 * The plan this page shows already holds every edit and reveal the room has not answered yet.
 */
export class BattleQueue {
  private pendingPlan: { commandId: string; battleId: string; patch: Partial<BattlePlanInput> } | null = null;
  private queuedPlan: { battleId: string; patch: Partial<BattlePlanInput> } | null = null;
  /* Readiness and reveals sent after an unanswered plan edit, in order, so neither overtakes it. */
  private queuedActions: BattleAction[] = [];
  private readonly disclosuresInFlight = new Map<string, Disclose>();

  constructor(private readonly table: BattleQueueTable) {}

  editPlan(battleId: string, patch: Partial<BattlePlanInput>) {
    this.queuedPlan = { battleId, patch: { ...this.queuedPlan?.patch, ...patch } };
    this.flushPlan();
  }

  /* Readiness or a reveal queues while a plan edit is unanswered, or behind another one already queued so they keep their order. */
  queueBehindPlan(action: PieceAction) {
    const waiting = !!this.pendingPlan || this.queuedActions.length > 0;
    if (!waiting || !waitsForPlan(action)) {
      return false;
    }
    this.queuedActions.push(action);
    return true;
  }

  disclosureSent(commandId: string, action: Disclose) {
    this.disclosuresInFlight.set(commandId, action);
  }

  settle(commandId: string, outcome: 'completed' | 'rejected') {
    this.disclosuresInFlight.delete(commandId);
    if (this.pendingPlan?.commandId === commandId) {
      this.pendingPlan = null;
      if (outcome === 'rejected') {
        this.queuedPlan = null;
        this.queuedActions = [];
      }
    }
  }

  /* A new battle replaces the one these commands were for, so none of them goes out. */
  discardReplaced(battleId: string | undefined) {
    if (
      (this.pendingPlan && battleId !== this.pendingPlan.battleId) ||
      (this.queuedPlan && battleId !== this.queuedPlan.battleId) ||
      this.queuedActions.some((action) => battleId !== action.battleId)
    ) {
      this.pendingPlan = null;
      this.queuedPlan = null;
      this.queuedActions = [];
    }
  }

  clear() {
    this.pendingPlan = null;
    this.queuedPlan = null;
    this.queuedActions = [];
    this.disclosuresInFlight.clear();
  }

  flush() {
    this.flushPlan();
    this.flushActions();
  }

  /* The room's snapshot as this page shows it, with what it has not answered yet; replayed history shows the plan as it stood then. */
  shown(authoritative: GameSnapshot, replaying: boolean): GameSnapshot {
    return replaying ? authoritative : this.withUnsettledDisclosures(this.withPendingPlan(authoritative));
  }

  private flushPlan() {
    const snapshot = this.table.snapshot();
    const { battle, battlePlan: plan } = snapshot;
    if (!this.table.canAct() || this.pendingPlan || !this.queuedPlan || !battle || !plan) {
      return;
    }
    const { strength: _strength, faces: _faces, pieces: _pieces, disclosed: _disclosed, ...input } = plan;
    const commandId = crypto.randomUUID();
    const patch = this.queuedPlan.patch;
    this.queuedPlan = null;
    this.pendingPlan = { commandId, battleId: battle.id, patch };
    this.table.sendPlan(commandId, battle.id, { ...input, ...patch }, snapshot.revision);
  }

  /*
   * Queued readiness and reveals go out in order, only as many as the unanswered limit lets through; the rest wait
   * for earlier commands to be answered, since each answer flushes the queues again.
   */
  private flushActions() {
    while (this.mayFlushAction()) {
      const [next, ...rest] = this.queuedActions;
      this.queuedActions = [];
      this.table.command(next!);
      this.queuedActions = [...rest, ...this.queuedActions];
    }
  }

  private mayFlushAction() {
    const planInFlight = !!(this.pendingPlan || this.queuedPlan);
    return this.table.hasRoom() && this.table.canAct() && !planInFlight && this.queuedActions.length > 0;
  }

  /* Plan edits not yet answered show at once, with the bank holding the spice they commit. */
  private withPendingPlan(authoritative: GameSnapshot): GameSnapshot {
    const pending = this.pendingPlan;
    if (!pending || !authoritative.battlePlan || authoritative.battle?.id !== pending.battleId) {
      return authoritative;
    }
    const was = authoritative.battlePlan;
    return withPlan(authoritative, was, { ...was, ...pending.patch, ...this.queuedPlan?.patch });
  }

  /*
   * A reveal not yet answered, queued behind plan edits or on its way, already shows as revealed, so its part locks
   * before a later edit can overtake it and change what the room reveals. A hide shows only once the room has it,
   * keeping the part locked meanwhile.
   */
  private withUnsettledDisclosures(snapshot: GameSnapshot): GameSnapshot {
    if (!snapshot.battlePlan) {
      return snapshot;
    }
    const unsettled = [...this.queuedActions, ...this.disclosuresInFlight.values()];
    const reveals = unsettled.flatMap((action) => revealIn(action, snapshot.battle?.id));
    return reveals.length
      ? {
          ...snapshot,
          battlePlan: {
            ...snapshot.battlePlan,
            disclosed: reveals.reduce((shown, reveal) => shownWith(shown, reveal), snapshot.battlePlan.disclosed),
          },
        }
      : snapshot;
  }
}
