import type { BattlePlan, BattlePlanInput, Disclosure } from '@shared/play/battle';
import {
  dialsFlat,
  dialsFree,
  flatStrength,
  kissSpice,
  spiceStrength,
  spiceStrengthChoices,
} from '@shared/play/battleDialing';
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

type Projected = Pick<BattlePlan, 'mode' | 'troops' | 'spice' | 'adjustment' | 'faces' | 'dialing'>;

/*
 * Advanced Max support as the Worker allocates it: the spice buys the most strength it can, spent exactly where it can be,
 * otherwise as much of it as can be spent. Each face's troops go in doubling batches, so a large count stays a short search.
 */
function maxSupport(troops: Projected['troops'], faces: Projected['faces'], spice: number) {
  let states = new Map<number, { gain: number; supported: number[] }>([
    [0, { gain: 0, supported: troops.map(() => 0) }],
  ]);
  troops.forEach((troop, index) => {
    const face = faces.find((candidate) => candidate.id === troop.faceId);
    let remaining = face ? troop.undialed + troop.dialed : 0;
    for (let batch = 1; face && remaining > 0; batch *= 2) {
      const quantity = Math.min(batch, remaining);
      remaining -= quantity;
      const next = new Map(states);
      for (const [spent, allocation] of states) {
        const total = spent + quantity * face.supportCost;
        const gain = allocation.gain + quantity * (face.supportedStrength - face.strength);
        const previous = next.get(total);
        if (total <= spice && (!previous || gain > previous.gain)) {
          const supported = [...allocation.supported];
          supported[index] += quantity;
          next.set(total, { gain, supported });
        }
      }
      states = next;
    }
  });
  const spent = states.has(spice) ? spice : Math.max(...states.keys());
  const supported = states.get(spent)!.supported;
  return {
    spice: spent,
    troops: troops.map((troop, index) => ({
      ...troop,
      dialed: supported[index]!,
      undialed: troop.undialed + troop.dialed - supported[index]!,
    })),
  };
}

/*
 * A plan as the room will settle it, worked out the way the Worker does, so an edit the room has not answered yet shows
 * its own support, spice and strength at once rather than the room's last answer.
 */
function projectedPlan<P extends Projected>(plan: P, was: Projected): P & { strength: number } {
  if (dialsFlat(plan.dialing)) {
    const troops = plan.troops.map((troop) => ({ ...troop, undialed: troop.undialed + troop.dialed, dialed: 0 }));
    const dial = flatStrength(troops, plan.faces);
    const free = dialsFree(troops, plan.faces);
    let spice = 0;
    let bonus = 0;
    if (plan.dialing === 'gf92') {
      spice = spiceStrengthChoices(dial, free).findLast((choice) => choice <= plan.spice) ?? 0;
      bonus = spiceStrength(dial, spice, free);
    } else if (plan.dialing === 'kiss') {
      spice = kissSpice(troops, plan.faces);
    }
    return { ...plan, troops, spice, strength: dial + bonus + plan.adjustment };
  }
  const declared = plan.mode === was.mode ? plan.troops : [];
  const cost = (faceId: string) => plan.faces.find((face) => face.id === faceId)?.supportCost ?? 1;
  const settled =
    plan.mode === 'custom'
      ? { troops: declared, spice: declared.reduce((total, troop) => total + troop.dialed * cost(troop.faceId), 0) }
      : maxSupport(declared, plan.faces, plan.mode === was.mode ? plan.spice : 0);
  const strength = settled.troops.reduce((total, troop) => {
    const face = plan.faces.find((candidate) => candidate.id === troop.faceId);
    return total + troop.undialed * (face?.strength ?? 0) + troop.dialed * (face?.supportedStrength ?? 0);
  }, plan.adjustment);
  return { ...plan, ...settled, strength };
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
    const {
      strength: _strength,
      faces: _faces,
      dialing: _dialing,
      pieces: _pieces,
      disclosed: _disclosed,
      ...input
    } = plan;
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

  /*
   * Plan edits not yet answered show at once, with the bank holding the spice they commit: the one on its way, and the
   * ones queued behind it or held back while the session cannot send, as during a resync.
   */
  private withPendingPlan(authoritative: GameSnapshot): GameSnapshot {
    const pending = this.pendingPlan;
    const queued = this.queuedPlan;
    const battleId = pending?.battleId ?? queued?.battleId;
    if (!battleId || !authoritative.battlePlan || authoritative.battle?.id !== battleId) {
      return authoritative;
    }
    const was = authoritative.battlePlan;
    /*
     * The room's support and strength belong to the plan it last answered; an edit still on its way settles its own.
     * The edit on its way settles first and the queued one on top of it, in the order the room will take them.
     */
    const sent = pending ? projectedPlan({ ...was, ...pending.patch }, was) : was;
    return withPlan(authoritative, was, queued ? projectedPlan({ ...sent, ...queued.patch }, sent) : sent);
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
