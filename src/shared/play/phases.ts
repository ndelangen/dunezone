export const TABLE_PHASES = [
  { id: 'storm', label: 'Storm', instructions: 'Move the storm using the storm controls.' },
  { id: 'spice-blow', label: 'Spice blow', instructions: 'Reveal spice cards and place spice on the board.' },
  { id: 'choam-charity', label: 'CHOAM charity', instructions: 'Collect any spice granted by your ruleset.' },
  { id: 'bidding', label: 'Bidding', instructions: 'Bid for cards and handle payments between players.' },
  { id: 'revival', label: 'Revival', instructions: 'Revive forces and leaders according to your ruleset.' },
  {
    id: 'shipment-and-movement',
    label: 'Shipment and movement',
    instructions: 'Ship and move your forces on the board.',
  },
  { id: 'battle', label: 'Battle', instructions: 'Resolve battles together and move the pieces and cards involved.' },
  { id: 'spice-collection', label: 'Spice collection', instructions: 'Collect spice from the board.' },
  { id: 'mentat-pause', label: 'Mentat pause', instructions: 'Check the game outcome and prepare for the next turn.' },
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
