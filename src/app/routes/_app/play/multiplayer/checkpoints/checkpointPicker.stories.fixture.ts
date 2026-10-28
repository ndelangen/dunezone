import { TABLE_PHASES } from '@shared/play/phases';
import type { ReviewCheckpoint } from '@shared/play/review';

import { factions } from '../../product.stories.fixture';

/* Battles each turn of the long game settles: most turns fight once or twice, some not at all, Turn 7 three times. */
const BATTLES = [0, 1, 2, 0, 1, 2, 3, 1, 0, 2, 1];

/* The six factions at the table, in the storm order they ship and move in. */
const SEATED = factions.slice(0, 6).map((faction) => faction.data.name);

/* The moments a phase saves after its start: each faction finishing Shipment and Movement, each settled battle. */
function laterMoments(phaseId: string, turn: number): Pick<ReviewCheckpoint, 'moment' | 'faction'>[] {
  if (phaseId === 'shipment-and-movement') {
    return SEATED.map((faction) => ({ moment: 'turn' as const, faction }));
  }
  const battles = phaseId === 'battle' ? (BATTLES[turn - 1] ?? 0) : 0;
  return Array.from({ length: battles }, () => ({ moment: 'battle' as const, faction: null }));
}

/**
 * A game ten turns in, playing Turn 11's Battle: setup's two steps, then every phase of every turn, with each faction's Shipment and Movement and each settled battle after its phase's start.
 * The table saves a step for each of these, as the Worker does.
 */
export function longGameCheckpoints(turns = 11): ReviewCheckpoint[] {
  let step = 0;
  const checkpoints: ReviewCheckpoint[] = [
    {
      step: ++step,
      context: 'Setup, Traitor selection',
      turn: null,
      label: 'Traitor selection',
      symbol: '/vector/icon/traitor.svg',
      moment: 'entered',
      faction: null,
    },
    {
      step: ++step,
      context: 'Setup, Starting troops',
      turn: null,
      label: 'Starting troops',
      symbol: '/vector/icon/shipment_disc.svg',
      moment: 'entered',
      faction: null,
    },
  ];
  for (let turn = 1; turn <= turns; turn++) {
    const phases = turn === turns ? TABLE_PHASES.slice(0, 7) : TABLE_PHASES;
    for (const phase of phases) {
      const place = { context: `Turn ${turn}, ${phase.label}`, turn, label: phase.label, symbol: phase.symbol };
      checkpoints.push({ step: ++step, ...place, moment: 'entered', faction: null });
      checkpoints.push(...laterMoments(phase.id, turn).map((moment) => ({ step: ++step, ...place, ...moment })));
    }
  }
  return checkpoints;
}

/** The newest checkpoints a proposal offers today: the last thirty, about three turns. */
export function offeredCheckpoints(): ReviewCheckpoint[] {
  return longGameCheckpoints().slice(-30);
}
