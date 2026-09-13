import { initialSnapshot } from './commands';
import type { LoadProfile } from './loadProfile';
import workload from './loadWorkload.json';
import type { TablePiece } from './model';
import type { GameSnapshot } from './protocol';
import { restingPositionAt } from './tableGeometry';

export { loadProfileSchema } from './loadProfile';
export type { LoadProfile } from './loadProfile';
export const LOAD_SEATS = Array.from({ length: workload.players }, (_, index) => `load-seat-${index + 1}`);

/** Synthetic public content for the agreed workload; the baseline fixture never calls this. */
export function loadSnapshot(profile: LoadProfile): GameSnapshot {
  const snapshot = initialSnapshot();
  const pieces: TablePiece[] = [];
  const add = (kind: TablePiece['kind'], first: number, count: number) => {
    const index = pieces.length;
    const id = `${kind}-${first}`;
    const orientation = 0;
    pieces.push({
      id,
      label: kind === 'card' ? 'Synthetic cards' : 'Synthetic tokens',
      owner: 'shared',
      color: kind === 'card' ? '#3f2523' : '#176a73',
      accent: '#d99b57',
      items: Array.from({ length: count }, (_, item) => ({
        id: `${kind}-item-${first + item}`,
        faceUp: kind !== 'card',
      })),
      stackKey: kind,
      position: restingPositionAt([((index % 30) - 15) * 0.27, 0, -3.9 + Math.floor(index / 30) * 0.12], {
        kind,
        orientation,
      }),
      orientation,
      zoneId: null,
      locked: false,
      kind,
    });
  };
  for (let item = 0; item < workload.tokens;) {
    const count =
      profile === 'stacked' && item < workload.tokenStacks * workload.tokensPerStack ? workload.tokensPerStack : 1;
    add('force', item, count);
    item += count;
  }
  for (let item = 0; item < workload.decks * workload.cardsPerDeck;) {
    const count = profile === 'stacked' ? workload.cardsPerDeck : 1;
    add('card', item, count);
    item += count;
  }
  const actionPiece = pieces.at(-1)!;
  actionPiece.position = restingPositionAt([0, 0, 3], actionPiece);
  return {
    ...snapshot,
    table: { ...snapshot.table, pieces },
    versions: Object.fromEntries(pieces.map((piece) => [piece.id, 0])),
  };
}
