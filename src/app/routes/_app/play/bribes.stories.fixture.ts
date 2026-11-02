import { bribePilePosition } from '@shared/play/bribes';
import type { BribePilePlacement } from '@shared/play/bribes';
import { factionTokenOf } from '@shared/play/factionToken';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import { rosterFactionIds } from '@shared/play/protocol';
import { createSpiceStack } from '@shared/play/spiceBank';
import { restingPositionAt, stackTopHeight } from '@shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '@shared/play/tablePhysics';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { expect, waitFor } from 'storybook/test';

import { mapViewPoint } from './mapView.stories.fixture';
import { playingSnapshot } from './product.stories.fixture';

/* How much each faction has been bribed so far, in roster order, so the piles stand at different heights. */
const BRIBED = [3, 1, 4, 2, 5, 2];

/* A spice stack of `count` set down as near `at` as the table allows, as the room settles a drop. */
function spiceAt(snapshot: GameSnapshot, id: number, count: number, at: Vector3Tuple): TablePiece {
  const stack = createSpiceStack(id, count);
  const position = nearestCollisionFreePosition(stack, restingPositionAt(at, stack), snapshot.table.pieces)!;
  return { ...stack, position: restingPositionAt(position, stack) };
}

function withPiece(snapshot: GameSnapshot, piece: TablePiece): GameSnapshot {
  return {
    ...snapshot,
    table: { ...snapshot.table, pieces: [...snapshot.table.pieces, piece] },
    versions: { ...snapshot.versions, [piece.id]: snapshot.revision },
  };
}

/** The mid-play table with a bribe pile by every faction, each where `placement` puts it. */
export function bribePilesSnapshot(placement: BribePilePlacement, snapshot = playingSnapshot()): GameSnapshot {
  return rosterFactionIds(snapshot.roster).reduce((next, factionId, index) => {
    const pile = bribePilePosition(next.table.pieces, next.roster, factionId, placement)!;
    return withPiece(next, spiceAt(next, 9100 + index, BRIBED[index % BRIBED.length]!, pile));
  }, snapshot);
}

/** The viewer's seat, seat 2, with 3 spice withdrawn onto the table in front of its station, ready to carry onto another faction's token. */
export function looseSpiceSnapshot(snapshot = playingSnapshot()): GameSnapshot {
  const seat = snapshot.roster!.seats.find((entry) => entry.id === 'seat-2')!;
  const angle = tableSeatAngles(snapshot.roster!.seatCount)[seat.position]!;
  const radius = PLAYER_RING_RADIUS - 0.55;
  return withPiece(snapshot, spiceAt(snapshot, 9000, 3, [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]));
}

/** The spice the viewer carries in a gift story, and the top of the faction token it is carried onto: seat 3's. */
export function giftPoints(snapshot: GameSnapshot) {
  const spice = snapshot.table.pieces.find((piece) => piece.id === 'spice-9000')!;
  const factionId = snapshot.roster!.seats.find((entry) => entry.id === 'seat-3')!.faction!.id;
  const token = factionTokenOf(snapshot.table.pieces, factionId)!;
  const top = (piece: TablePiece): Vector3Tuple => [
    piece.position[0],
    piece.position[1] + stackTopHeight(piece),
    piece.position[2],
  ];
  return { spice: top(spice), token: top(token), factionId };
}

/**
 * Carries the table point `from` onto `to` in the map view and lets go there: a press, a move past the drag threshold, a move onto `to` and a release, sent to the canvas `mapViewPoint` projects against.
 */
export async function carryOnto(document: Document, from: Vector3Tuple, to: Vector3Tuple) {
  const scene = document.querySelector('canvas')!;
  const [startX, startY] = mapViewPoint(document, from);
  const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0 };
  await waitFor(
    async () => {
      if (scene.style.cursor !== 'grabbing') {
        scene.dispatchEvent(
          new PointerEvent('pointerdown', { ...pointer, clientX: startX, clientY: startY, buttons: 1 })
        );
        scene.dispatchEvent(
          new PointerEvent('pointermove', { ...pointer, clientX: startX + 24, clientY: startY, buttons: 1 })
        );
      }
      await expect(scene.style.cursor).toBe('grabbing');
    },
    { timeout: 30_000 }
  );
  const [endX, endY] = mapViewPoint(document, to);
  const view = document.defaultView!;
  view.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: endX, clientY: endY, buttons: 1 }));
  view.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: endX, clientY: endY, buttons: 0 }));
}
