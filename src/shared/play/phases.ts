import type { PhaseDeclaration, PhaseTarget, SetupPhaseTarget } from '../factions/extraPhases';
import { GameRejection } from './rejection';

function phase<
  const Id extends string,
  const Label extends string,
  const Symbol extends string,
  const Instructions extends string,
>(id: Id, label: Label, symbol: Symbol, instructions: Instructions) {
  return { id, label, symbol, instructions } as const;
}

export const TABLE_PHASES = [
  phase('storm', 'Storm', '/vector/icon/storrm_standalone.svg', 'Move the storm using the storm controls.'),
  phase(
    'spice-blow',
    'Spice blow',
    '/vector/icon/spice-blow_standalone.svg',
    'Reveal spice cards and place spice on the board.'
  ),
  phase('choam-charity', 'CHOAM charity', '/vector/generic/chaom.svg', 'Collect any spice granted by your ruleset.'),
  phase(
    'bidding',
    'Bidding',
    '/vector/icon/bidding_standalone.svg',
    'Bid for cards and handle payments between players.'
  ),
  phase(
    'revival',
    'Revival',
    '/vector/icon/revival_standalone.svg',
    'Revive forces and leaders according to your ruleset.'
  ),
  phase(
    'shipment-and-movement',
    'Shipment and movement',
    '/vector/icon/shipment_disc.svg',
    'Ship and move your forces on the board.'
  ),
  phase(
    'battle',
    'Battle',
    '/vector/icon/combat.svg',
    'Resolve battles together and move the pieces and cards involved.'
  ),
  phase(
    'spice-collection',
    'Spice collection',
    '/vector/icon/collection_standalone.svg',
    'Collect spice from the board.'
  ),
  phase(
    'mentat-pause',
    'Mentat pause',
    '/vector/icon/mentat.svg',
    'Check the game outcome and prepare for the next turn.'
  ),
] as const;

export type TablePhaseId = (typeof TABLE_PHASES)[number]['id'];

/**
 * One entry of a composed turn: a standard phase, or a faction's declaration placed before one (#1138).
 * A faction entry's id is `${factionId}:${declaration.id}`, and `before` names the standard phase it precedes, which also gives it that phase's camera view.
 */
export type PhaseEntry = {
  id: string;
  label: string;
  symbol: string;
  instructions: string;
  allPlayersMustBeReady: boolean;
  kind: 'standard' | 'faction';
  factionId?: string;
  before?: TablePhaseId;
};

/* Only Mentat pause asks every player to be ready among the standard phases. */
export const STANDARD_PHASES: readonly PhaseEntry[] = TABLE_PHASES.map((entry) => ({
  ...entry,
  allPlayersMustBeReady: entry.id === 'mentat-pause',
  kind: 'standard' as const,
}));

/** The standard phase an entry stands for or precedes: its camera view and its built-in behavior key on this. */
export function standardPhaseOf(entry: PhaseEntry): TablePhaseId {
  return entry.kind === 'standard' ? (entry.id as TablePhaseId) : entry.before!;
}

export function phaseAt(index: number, phases: readonly PhaseEntry[] = STANDARD_PHASES): PhaseEntry {
  return phases[index % phases.length]!;
}

export function tableProgressFor(index: number, phases: readonly PhaseEntry[] = STANDARD_PHASES) {
  return {
    turn: Math.floor(index / phases.length) + 1,
    phases,
    activePhaseId: phaseAt(index, phases).id,
  };
}

/**
 * The index the standard nine would give the same moment: the same turn, at the standard phase this entry is or precedes.
 * The lobby names a phase from a standard-turn index, so a composed turn reports through this.
 */
export function lobbyPhaseIndex(index: number, phases?: readonly PhaseEntry[]): number {
  if (!phases) {
    return index;
  }
  const { turn } = tableProgressFor(index, phases);
  const standard = STANDARD_PHASES.findIndex((phase) => phase.id === standardPhaseOf(phaseAt(index, phases)));
  return (turn - 1) * STANDARD_PHASES.length + standard;
}

/** A faction's retained declarations, in the author's list order. */
export type FactionPhaseDeclarations = {
  factionId: string;
  declarations: readonly PhaseDeclaration[];
};

/**
 * The entries placed before one target: priority ascending, then storm order between factions, then the author's list order within one faction.
 * `stormOrder` lists faction ids;
 * a faction it does not name sorts after those it does.
 */
function placedBefore(
  target: PhaseTarget,
  factions: readonly FactionPhaseDeclarations[],
  stormOrder: readonly string[]
) {
  const rank = (factionId: string) => {
    const at = stormOrder.indexOf(factionId);
    return at === -1 ? stormOrder.length : at;
  };
  return factions
    .flatMap(({ factionId, declarations }) =>
      declarations.flatMap((declaration, order) =>
        declaration.before === target ? [{ factionId, declaration, order }] : []
      )
    )
    .sort(
      (left, right) =>
        left.declaration.priority - right.declaration.priority ||
        rank(left.factionId) - rank(right.factionId) ||
        left.order - right.order
    );
}

function factionEntry(factionId: string, declaration: PhaseDeclaration): PhaseEntry {
  return {
    id: `${factionId}:${declaration.id}`,
    label: declaration.title,
    symbol: declaration.symbol,
    instructions: declaration.instructions ?? '',
    allPlayersMustBeReady: declaration.allPlayersMustBeReady,
    kind: 'faction',
    factionId,
  };
}

/** One turn: each standard phase preceded by the declarations targeting it. */
export function composeTurn(
  factions: readonly FactionPhaseDeclarations[],
  stormOrder: readonly string[]
): PhaseEntry[] {
  return STANDARD_PHASES.flatMap((standard) => [
    ...placedBefore(standard.id as TablePhaseId, factions, stormOrder).map(({ factionId, declaration }) => ({
      ...factionEntry(factionId, declaration),
      before: standard.id as TablePhaseId,
    })),
    standard,
  ]);
}

/** A declaration placed in setup, with the faction that declared it, in setup order. */
export type SetupPlacement = { factionId: string; declaration: PhaseDeclaration; before: SetupPhaseTarget };

/** Setup is `[before traitors] + traitors + [before forces] + forces`; this returns the placed declarations for each slot. */
export function composeSetup(
  factions: readonly FactionPhaseDeclarations[],
  stormOrder: readonly string[]
): Record<SetupPhaseTarget, SetupPlacement[]> {
  const slot = (before: SetupPhaseTarget) =>
    placedBefore(before, factions, stormOrder).map(({ factionId, declaration }) => ({
      factionId,
      declaration,
      before,
    }));
  return { traitors: slot('traitors'), forces: slot('forces') };
}

export function stepPhase(index: number, direction: -1 | 1 = 1): number {
  const next = index + direction;
  if (next < 0) {
    throw new GameRejection('The table is already at the first phase of Turn 1.');
  }
  if (!Number.isSafeInteger(next)) {
    throw new GameRejection('The phase counter cannot advance further.');
  }
  return next;
}

export function phaseForTurn(index: number, turn: number, phaseCount: number = STANDARD_PHASES.length): number {
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new GameRejection('Choose a whole turn number starting at 1.');
  }
  const next = (turn - 1) * phaseCount + (index % phaseCount);
  if (!Number.isSafeInteger(next)) {
    throw new GameRejection('The phase counter cannot advance further.');
  }
  return next;
}

export const PHASE_CHANGE_COOLDOWN_MS = 8000;
