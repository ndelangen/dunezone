import { emptyBattlePlan, BATTLE_COUNTDOWN_MS } from '../../src/shared/play/battle';
import type { BattleAction, BattlePlan, BattlePlanInput, CombatFace } from '../../src/shared/play/battle';
import { isBattleLeader } from '../../src/shared/play/battle';
import { nextSnapshot } from '../../src/shared/play/commands';
import type { TablePiece } from '../../src/shared/play/model';
import { phaseAt } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { BOARD_RADIUS, restingPositionAt } from '../../src/shared/play/tableGeometry';
import { clampPositionToTable, nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import type { StoredSnapshot, StoredBattle } from './state';

type BattleActor = { snapshot: StoredSnapshot; battle: StoredBattle; factionId: string };
type Combatant = BattleActor & { side: 0 | 1 };

const refuse = (message: string): never => {
  throw new GameRejection(message);
};
function commit(snapshot: StoredSnapshot, changes: Partial<StoredSnapshot>, pieces = snapshot.table.pieces) {
  return { ...nextSnapshot(snapshot, { ...tableForViewer(snapshot, SPECTATOR_SEAT), pieces }), ...changes };
}
function sideFor(battle: StoredBattle, factionId: string): 0 | 1 {
  const side = battle.sides.findIndex((side) => side?.factionId === factionId);
  if (side !== 0 && side !== 1) {
    return refuse('Only a combatant can change its plan or outcome.');
  }
  return side;
}
function sum(a: number, b: number) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) {
    return refuse('The declared count is too large.');
  }
  return result;
}

/** Exact funding uses bounded binary groups, including zero-cost and negative-strength faces. */
function allocations(troops: BattlePlanInput['troops'], faces: Map<string, CombatFace>, limit: number) {
  let states = new Map<number, { gain: number; funded: number[] }>([[0, { gain: 0, funded: troops.map(() => 0) }]]);
  troops.forEach((troop, index) => {
    const face = faces.get(troop.faceId)!;
    let remaining = sum(troop.undialed, troop.dialed);
    for (let batch = 1; remaining > 0; batch *= 2) {
      const quantity = Math.min(batch, remaining);
      remaining -= quantity;
      const cost = quantity * face.fundingCost;
      const gain = quantity * (face.fundedStrength - face.strength);
      const next = new Map(states);
      for (const [spent, allocation] of states) {
        const total = spent + cost;
        if (total > limit) {
          continue;
        }
        const previous = next.get(total);
        if (!previous || allocation.gain + gain > previous.gain) {
          const funded = [...allocation.funded];
          funded[index] += quantity;
          next.set(total, { gain: allocation.gain + gain, funded });
        }
      }
      /* A pathological declaration fails explicitly before consuming unbounded Worker memory. */
      if (next.size > 100_000) {
        return refuse('This funding calculation is too large. Reduce the declaration.');
      }
      states = next;
    }
  });
  return states;
}

function fundMaxTroops(
  troops: BattlePlanInput['troops'],
  faces: Map<string, CombatFace>,
  spice: number,
  before: BattlePlan
) {
  const states = allocations(troops, faces, spice);
  if (!states.has(spice)) {
    const troopEdit = JSON.stringify(troops) !== JSON.stringify(before.troops) && spice === before.spice;
    if (!troopEdit) {
      return refuse('That exact amount of spice cannot fund these troops.');
    }
    spice = [...states.keys()].reduce((highest, value) => Math.max(highest, value), 0);
  }
  const allocation = states.get(spice)!;
  troops.forEach((troop, index) => {
    const total = sum(troop.undialed, troop.dialed);
    troop.dialed = allocation.funded[index];
    troop.undialed = total - troop.dialed;
  });
  return spice;
}

function declaredStrength(troops: BattlePlanInput['troops'], faces: Map<string, CombatFace>, adjustment: number) {
  const strength = troops.reduce((total, troop) => {
    const face = faces.get(troop.faceId)!;
    return total + troop.undialed * face.strength + troop.dialed * face.fundedStrength;
  }, adjustment);
  if (!Number.isFinite(strength)) {
    return refuse('The declared strength is too large.');
  }
  return strength;
}

function fundedPlan(input: BattlePlanInput, before: BattlePlan) {
  const faces = new Map(before.faces.filter((face) => face.capable).map((face) => [face.id, face]));
  const troops = input.mode !== before.mode ? [] : input.troops.map((troop) => ({ ...troop }));
  if (
    new Set(troops.map((troop) => troop.faceId)).size !== troops.length ||
    troops.some((troop) => !faces.has(troop.faceId))
  ) {
    return refuse('Choose each eligible troop face once.');
  }
  let spice = input.mode !== before.mode ? 0 : input.spice;
  if (input.mode === 'custom') {
    spice = troops.reduce((total, troop) => sum(total, troop.dialed * faces.get(troop.faceId)!.fundingCost), 0);
  } else {
    spice = fundMaxTroops(troops, faces, spice, before);
  }
  const strength = declaredStrength(troops, faces, input.adjustment);
  return { ...input, troops, spice, strength, faces: before.faces };
}

function selectedPlanPieces(plan: BattlePlanInput, available: TablePiece[]) {
  const ids = [...(plan.leaderId ? [plan.leaderId] : []), ...plan.cardIds];
  if (new Set(ids).size !== ids.length) {
    return refuse('A piece can only be committed once.');
  }
  const pieces = ids.map(
    (id) => available.find((piece) => piece.id === id) ?? refuse('That piece is not in your inventory.')
  );
  if (pieces.some((piece) => piece.items.length !== 1)) {
    return refuse('Separate each card or leader before committing it.');
  }
  return pieces;
}
function validateCardSlots(pieces: TablePiece[], plan: BattlePlanInput) {
  if (pieces.some((piece) => plan.cardIds.includes(piece.id) && piece.kind !== 'card')) {
    return refuse('Choose cards for the card slots.');
  }
}
function validateLeaderSlot(pieces: TablePiece[], plan: BattlePlanInput) {
  if (!plan.leaderId) {
    return;
  }
  const leader = pieces.find((piece) => piece.id === plan.leaderId);
  if (!leader || !isBattleLeader(leader)) {
    return refuse('Choose a leader token for the leader slot.');
  }
}
function reservedBalance({ snapshot, factionId }: BattleActor, before: BattlePlan, plan: BattlePlanInput) {
  const balance = sum(snapshot.factionBanks[factionId] ?? 0, before.spice) - plan.spice;
  if (balance < 0) {
    return refuse('There is not enough banked spice for this plan.');
  }
  return balance;
}

function editPlan({ snapshot, battle, side, factionId }: Combatant, input: BattlePlanInput) {
  if (battle.stage !== 'preparing' || battle.sides[side]!.ready) {
    return refuse('Undo Ready before editing your plan.');
  }
  const before = battle.plans[side]!;
  const plan = fundedPlan(input, before);
  const available = [...(snapshot.factionInventories[factionId] ?? []), ...before.pieces];
  const pieces = selectedPlanPieces(plan, available);
  validateCardSlots(pieces, plan);
  validateLeaderSlot(pieces, plan);
  const balance = reservedBalance({ snapshot, battle, factionId }, before, plan);
  const ids = pieces.map((piece) => piece.id);
  battle.plans[side] = { ...plan, pieces };
  return commit(snapshot, {
    battleState: battle,
    factionBanks: { ...snapshot.factionBanks, [factionId]: balance },
    factionInventories: {
      ...snapshot.factionInventories,
      [factionId]: available.filter((piece) => !ids.includes(piece.id)),
    },
  });
}

function cancelBattle(snapshot: StoredSnapshot, battle: StoredBattle) {
  if (battle.stage !== 'preparing') {
    return refuse('The battle can only be cancelled during preparation.');
  }
  const factionBanks = { ...snapshot.factionBanks };
  const factionInventories = { ...snapshot.factionInventories };
  battle.sides.forEach((side, index) => {
    if (!side) {
      return;
    }
    const plan = battle.plans[index]!;
    factionBanks[side.factionId] = sum(factionBanks[side.factionId] ?? 0, plan.spice);
    factionInventories[side.factionId] = [...(factionInventories[side.factionId] ?? []), ...plan.pieces];
  });
  return commit(snapshot, { battleState: null, factionBanks, factionInventories });
}

function canTakeIntoHand(piece: TablePiece | undefined): piece is TablePiece {
  if (!piece) {
    return false;
  }
  if (piece.inventory || piece.locked) {
    return false;
  }
  if (piece.items.length !== 1) {
    return false;
  }
  return piece.kind === 'card' || isBattleLeader(piece);
}

function takeIntoHand(
  snapshot: StoredSnapshot,
  factionId: string,
  action: Extract<BattleAction, { kind: 'hand-take' }>
) {
  const { pieceId } = action;
  const inventory = snapshot.factionInventories[factionId] ?? [];
  const piece = snapshot.table.pieces.find((piece) => piece.id === pieceId);
  if (!canTakeIntoHand(piece)) {
    return refuse('Choose one unlocked card or leader on the table.');
  }
  const { battleOverlay: _overlay, ...stored } = piece;
  return commit(
    snapshot,
    {
      factionInventories: { ...snapshot.factionInventories, [factionId]: [...inventory, stored] },
    },
    snapshot.table.pieces.filter((piece) => piece.id !== pieceId)
  );
}

function playFromHand(
  snapshot: StoredSnapshot,
  factionId: string,
  action: Extract<BattleAction, { kind: 'hand-play' }>
) {
  const inventory = snapshot.factionInventories[factionId] ?? [];
  const piece = inventory.find((piece) => piece.id === action.pieceId);
  if (!piece) {
    return refuse('That piece is not in your inventory.');
  }
  const position = nearestCollisionFreePosition(
    piece,
    clampPositionToTable(piece, action.position),
    snapshot.table.pieces
  );
  if (!position) {
    return refuse('There is no clear space for that object.');
  }
  const played = {
    ...piece,
    inventory: undefined,
    items: piece.items.map((item) => ({ ...item, faceUp: false })),
    position: restingPositionAt(position, piece),
  };
  return commit(
    snapshot,
    {
      factionInventories: {
        ...snapshot.factionInventories,
        [factionId]: inventory.filter((piece) => piece.id !== action.pieceId),
      },
    },
    [...snapshot.table.pieces, played]
  );
}

function startBattle(snapshot: StoredSnapshot, action: Extract<BattleAction, { kind: 'battle-start' }>) {
  if (snapshot.battleState || phaseAt(snapshot.phase).id !== 'battle') {
    return refuse('Start a battle during the Battle phase when no battle is active.');
  }
  if (Math.hypot(action.anchor[0], action.anchor[2]) > BOARD_RADIUS) {
    return refuse('Place the battle marker on the board.');
  }
  return commit(snapshot, {
    battleState: {
      id: crypto.randomUUID(),
      anchor: action.anchor,
      territory: action.territory,
      stage: 'preparing',
      sides: [null, null],
      plans: [null, null],
      deadline: null,
    },
  });
}

function claimSide({ snapshot, battle, factionId }: BattleActor, side: 0 | 1) {
  if (battle.stage !== 'preparing' || battle.sides[side]) {
    return refuse('Choose an empty side for a faction that is not already in this battle.');
  }
  if (battle.sides.some((entry) => entry?.factionId === factionId)) {
    return refuse('Choose an empty side for a faction that is not already in this battle.');
  }
  battle.sides[side] = { factionId, ready: false, choice: null };
  battle.plans[side] = emptyBattlePlan(snapshot.combatFaces[factionId] ?? []);
  return commit(snapshot, { battleState: battle });
}

function setReady(
  { snapshot, battle, side }: Combatant,
  action: Extract<BattleAction, { kind: 'battle-ready' }>,
  now: number
) {
  const { ready } = action;
  if (battle.stage === 'revealed') {
    return refuse('The battle has already revealed.');
  }
  if (battle.deadline !== null && now >= battle.deadline) {
    return refuse('The battle has already revealed.');
  }
  if (battle.sides[side]!.ready === ready) {
    return refuse('Your readiness already has that value.');
  }
  battle.sides[side]!.ready = ready;
  const bothReady = battle.sides.every((entry) => entry?.ready);
  battle.stage = bothReady ? 'countdown' : 'preparing';
  battle.deadline = bothReady ? now + BATTLE_COUNTDOWN_MS : null;
  return commit(snapshot, { battleState: battle });
}

function settleOverlayPiece(piece: TablePiece, battle: StoredBattle, placed: TablePiece[]) {
  if (piece.battleOverlay !== battle.id) {
    return piece;
  }
  const { battleOverlay: _overlay, ...rest } = piece;
  const requested = clampPositionToTable(piece, [battle.anchor[0], 0, battle.anchor[2] + 0.7]);
  const position = nearestCollisionFreePosition(piece, requested, placed) ?? requested;
  const moved = { ...rest, position: restingPositionAt(position, piece) };
  placed.push(moved);
  return moved;
}

function resolveBattle(snapshot: StoredSnapshot, battle: StoredBattle, outcome: 'left' | 'none' | 'right') {
  const result = {
    id: battle.id,
    anchor: battle.anchor,
    territory: battle.territory,
    factions: [battle.sides[0]!.factionId, battle.sides[1]!.factionId] as [string, string],
    plans: battle.plans as [BattlePlan, BattlePlan],
    outcome,
    revision: snapshot.revision + 1,
  };
  const placed = snapshot.table.pieces.filter((piece) => piece.battleOverlay !== battle.id);
  const pieces = snapshot.table.pieces.map((piece) => settleOverlayPiece(piece, battle, placed));
  return commit(
    snapshot,
    { battleState: null, battleResults: [result, ...snapshot.battleResults].slice(0, 20) },
    pieces
  );
}

function chooseOutcome(
  { snapshot, battle, side }: Combatant,
  action: Extract<BattleAction, { kind: 'battle-outcome' }>
) {
  const { outcome } = action;
  if (battle.stage !== 'revealed') {
    return refuse('Wait for the reveal before choosing an outcome.');
  }
  battle.sides[side]!.choice = outcome;
  if (battle.sides.every((entry) => entry?.choice === outcome)) {
    return resolveBattle(snapshot, battle, outcome);
  }
  return commit(snapshot, { battleState: battle });
}

function combatantCommand(
  actor: BattleActor,
  action: Extract<BattleAction, { kind: 'battle-plan' | 'battle-ready' | 'battle-outcome' }>,
  now: number
) {
  const combatant = { ...actor, side: sideFor(actor.battle, actor.factionId) };
  switch (action.kind) {
    case 'battle-plan':
      return editPlan(combatant, action.plan);
    case 'battle-ready':
      return setReady(combatant, action, now);
    case 'battle-outcome':
      return chooseOutcome(combatant, action);
  }
}

/** Room supplies current faction authority and guards physical carries before entering this transition. */
export function battleCommand(
  snapshot: StoredSnapshot,
  factionId: string,
  action: BattleAction,
  now: number
): StoredSnapshot {
  switch (action.kind) {
    case 'hand-take':
      return takeIntoHand(snapshot, factionId, action);
    case 'hand-play':
      return playFromHand(snapshot, factionId, action);
    case 'battle-start':
      return startBattle(snapshot, action);
  }
  const battle = structuredClone(snapshot.battleState);
  if (!battle || battle.id !== action.battleId) {
    return refuse('That battle has ended.');
  }
  if (action.kind === 'battle-cancel') {
    return cancelBattle(snapshot, battle);
  }
  if (action.kind === 'battle-claim') {
    return claimSide({ snapshot, battle, factionId }, action.side);
  }
  return combatantCommand({ snapshot, battle, factionId }, action, now);
}

/** The caller persists this transition before exposing any revealed contents. */
export function expireBattle(snapshot: StoredSnapshot, now: number): StoredSnapshot | undefined {
  const battle = snapshot.battleState;
  if (!battle || battle.stage !== 'countdown') {
    return;
  }
  if (battle.deadline === null || now < battle.deadline) {
    return;
  }
  const revealed = { ...battle, stage: 'revealed' as const, deadline: null };
  const pieces = battle.plans.flatMap((plan, side) =>
    plan!.pieces.map((piece, index) => ({
      ...piece,
      inventory: undefined,
      battleOverlay: battle.id,
      items: piece.items.map((item) => ({ ...item, faceUp: true })),
      position: restingPositionAt([battle.anchor[0] + (side ? 0.6 : -0.6), 0, battle.anchor[2] + index * 0.25], piece),
    }))
  );
  return commit(snapshot, { battleState: revealed }, [...snapshot.table.pieces, ...pieces]);
}
