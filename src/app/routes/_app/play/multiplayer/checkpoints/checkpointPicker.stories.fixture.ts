import { TABLE_PHASES } from '@shared/play/phases';
import type { ReviewCheckpoint } from '@shared/play/review';

/* Battles each turn of the long game settles: most turns fight once or twice, some not at all, Turn 7 three times. */
const BATTLES = [0, 1, 2, 0, 1, 2, 3, 1, 0, 2, 1];

/**
 * A game ten turns in, playing Turn 11's Battle: setup's two steps, then every phase of every turn, each settled battle after its phase's start.
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
    },
    {
      step: ++step,
      context: 'Setup, Starting troops',
      turn: null,
      label: 'Starting troops',
      symbol: '/vector/icon/shipment_disc.svg',
      moment: 'entered',
    },
  ];
  for (let turn = 1; turn <= turns; turn++) {
    const phases = turn === turns ? TABLE_PHASES.slice(0, 7) : TABLE_PHASES;
    for (const phase of phases) {
      const place = { context: `Turn ${turn}, ${phase.label}`, turn, label: phase.label, symbol: phase.symbol };
      checkpoints.push({ step: ++step, ...place, moment: 'entered' });
      if (phase.id === 'battle') {
        for (let battle = 0; battle < (BATTLES[turn - 1] ?? 0); battle++) {
          checkpoints.push({ step: ++step, ...place, moment: 'battle' });
        }
      }
    }
  }
  return checkpoints;
}

/** The newest checkpoints a proposal offers today: the last thirty, about three turns. */
export function offeredCheckpoints(): ReviewCheckpoint[] {
  return longGameCheckpoints().slice(-30);
}
