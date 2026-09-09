export const TABLE_PHASES = [
  {
    id: 'storm',
    label: 'Storm',
    symbol: '/vector/icon/storrm_standalone.svg',
    instructions: 'Move the storm using the storm controls.',
  },
  {
    id: 'spice-blow',
    label: 'Spice blow',
    symbol: '/vector/icon/spice-blow_standalone.svg',
    instructions: 'Reveal spice cards and place spice on the board.',
  },
  {
    id: 'choam-charity',
    label: 'CHOAM charity',
    symbol: '/vector/generic/chaom.svg',
    instructions: 'Collect any spice granted by your ruleset.',
  },
  {
    id: 'bidding',
    label: 'Bidding',
    symbol: '/vector/icon/bidding_standalone.svg',
    instructions: 'Bid for cards and handle payments between players.',
  },
  {
    id: 'revival',
    label: 'Revival',
    symbol: '/vector/icon/revival_standalone.svg',
    instructions: 'Revive forces and leaders according to your ruleset.',
  },
  {
    id: 'shipment-and-movement',
    label: 'Shipment and movement',
    symbol: '/vector/icon/shipment_disc.svg',
    instructions: 'Ship and move your forces on the board.',
  },
  {
    id: 'battle',
    label: 'Battle',
    symbol: '/vector/icon/combat.svg',
    instructions: 'Resolve battles together and move the pieces and cards involved.',
  },
  {
    id: 'spice-collection',
    label: 'Spice collection',
    symbol: '/vector/icon/collection_standalone.svg',
    instructions: 'Collect spice from the board.',
  },
  {
    id: 'mentat-pause',
    label: 'Mentat pause',
    symbol: '/vector/icon/mentat.svg',
    instructions: 'Check the game outcome and prepare for the next turn.',
  },
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
