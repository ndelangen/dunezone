import type { GameSnapshot } from '@shared/play/protocol';

import { install } from './game.stories.fixture';
import { battleStory } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

export function battleSetup(
  stage: Parameters<typeof battleStory>[0],
  viewer = 'seat-2',
  change?: (snapshot: GameSnapshot) => void
) {
  return install(() => {
    const snapshot = battleStory(stage);
    change?.(snapshot);
    return productTransport(viewer, snapshot);
  });
}

export const readiness = install(() => productTransport('neutral', battleStory('preparing', true)));

/* A real game keys each faction by its Convex document id, so a label that prints the id instead of the roster's name only shows once the stories stop using slugs. */
export const convexIds: Record<string, string> = {
  'house-harkonnen': 'k175em553h9x2vq0t8c4wj6rsd7ab1ny',
  'house-atreides': 'k17fybprv2m8kq5z3x0hd9tnwc6js4ge',
};
export function withConvexIds(snapshot: GameSnapshot): GameSnapshot {
  return JSON.parse(
    Object.entries(convexIds).reduce(
      (json, [slug, id]) => json.replaceAll(`"${slug}"`, `"${id}"`),
      JSON.stringify(snapshot)
    )
  );
}

export const revealedPieces = install(() => {
  const snapshot = battleStory('revealed');
  const battle = snapshot.battle!;
  const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
  card.battleOverlay = battle.id;
  battle.revealed![0].pieces = [card];
  battle.revealed![0].cardIds = [card.id];
  return productTransport('seat-2', snapshot);
});
