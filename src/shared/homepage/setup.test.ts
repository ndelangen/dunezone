import { expect, test } from 'vitest';

import { placementAnchorForPose } from '../play/tableFurnitureLayout';
import { isCollisionFreePosition } from '../play/tablePhysics';
import { homepageSnapshot } from './setup';

test('the homepage deck starts in a supported card well', () => {
  const snapshot = homepageSnapshot('https://dune.zone');
  const deck = snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck')!;

  expect(placementAnchorForPose(deck, deck.position)).not.toBeNull();
  expect(
    isCollisionFreePosition(
      deck,
      deck.position,
      snapshot.table.pieces.filter((piece) => piece !== deck)
    )
  ).toBe(true);
});
