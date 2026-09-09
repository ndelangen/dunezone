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

export function phaseAt(index: number) {
  return TABLE_PHASES[index % TABLE_PHASES.length];
}

export function tableProgressFor(index: number) {
  return {
    turn: Math.floor(index / TABLE_PHASES.length) + 1,
    phases: TABLE_PHASES,
    activePhaseId: phaseAt(index).id,
  };
}

export function stepPhase(index: number, direction: -1 | 1 = 1): number {
  const next = index + direction;
  if (next < 0) {
    throw new Error('The table is already at the first phase of Turn 1.');
  }
  if (!Number.isSafeInteger(next)) {
    throw new Error('The phase counter cannot advance further.');
  }
  return next;
}

export function phaseForTurn(index: number, turn: number): number {
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new Error('Choose a whole turn number starting at 1.');
  }
  const next = (turn - 1) * TABLE_PHASES.length + (index % TABLE_PHASES.length);
  if (!Number.isSafeInteger(next)) {
    throw new Error('The phase counter cannot advance further.');
  }
  return next;
}
