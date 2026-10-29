import { composeTurn } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';

import { playingSnapshot as initialSnapshot, SIX } from './product.stories.fixture';

/* A seated faction declares a phase before Bidding (#1138): the turn gains one entry, and the header, help and tracker follow it. */
export function factionPhaseSnapshot(allPlayersMustBeReady: boolean): GameSnapshot {
  const snapshot = initialSnapshot();
  const factionId = snapshot.roster!.seats[1]!.faction!.id;
  const phases = composeTurn(
    [
      {
        factionId,
        declarations: [
          {
            id: 'negotiations',
            type: 'instruction',
            title: 'Guild negotiations',
            symbol: '/vector/icon/fate.svg',
            before: 'bidding',
            priority: 10,
            allPlayersMustBeReady,
            instructions: 'Agree any shipment deals before bidding opens.',
          },
        ],
      },
    ],
    [factionId]
  );
  return {
    ...snapshot,
    phases,
    phase: phases.findIndex((entry) => entry.kind === 'faction'),
    controls: { ...snapshot.controls!, seats: SIX.map((player) => player.seat), ready: [] },
  };
}
