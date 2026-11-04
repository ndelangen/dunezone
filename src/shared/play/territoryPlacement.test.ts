import { describe, expect, test } from 'vite-plus/test';

import { retainedArrakisBoard } from '../boards/geometry';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { restingPositionAt } from './tableGeometry';
import { footprintReach, piecesOverlapAt } from './tablePhysics';
import {
  applyDraftToState,
  draftForGesture,
  noRoomMessage,
  playFromHandSettled,
  settleCarryAtPosition,
} from './tableState';
import { fitsInside, innermostPoint, tableTerritories, territoryContains } from './territoryFit';
import type { TableTerritory } from './territoryFit';
import { territoryLanding } from './territoryPlacement';

const troopBase = freshTableState().pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
const cardBase = freshTableState().pieces.find((piece) => piece.kind === 'card')!;

function territoryNamed(name: string): TableTerritory {
  return tableTerritories(retainedArrakisBoard()).find((territory) => territory.name === name)!;
}

function deepestPoint(territory: TableTerritory): Vector3Tuple {
  const [x, z] = innermostPoint(territory);
  return [x, 0, z];
}

function troop(id: string, faction: string, position: Vector3Tuple, count = 1): TablePiece {
  return {
    ...troopBase,
    id,
    owner: faction,
    stackKey: `forces:${faction}`,
    items: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, faceUp: true })),
    position: restingPositionAt(position, troopBase),
  };
}

function tableWith(...pieces: TablePiece[]): TableState {
  return { ...freshTableState(), pieces, selectedPieceId: null };
}

const at = (state: TableState, id: string) => state.pieces.find((piece) => piece.id === id)!;

function dropAt(state: TableState, id: string, position: Vector3Tuple) {
  const draft = draftForGesture(at(state, id), 'whole')!;
  const settled = settleCarryAtPosition(state, draft, position);
  return settled ? applyDraftToState(state, settled) : null;
}

function insideTerritory(territory: TableTerritory, piece: TablePiece) {
  return fitsInside(territory, [piece.position[0], piece.position[2]], footprintReach(piece));
}

const SHELF: Vector3Tuple = [-4.8, 0, 3.2];

describe('stacks dropped into a territory', () => {
  const arrakeen = territoryNamed('Arrakeen');
  const centre = deepestPoint(arrakeen);

  test('make room: the stack already there shifts over, and both stay inside the territory', () => {
    const state = tableWith(troop('atreides', 'atreides', centre, 5), troop('harkonnen', 'harkonnen', SHELF, 3));
    const next = dropAt(state, 'harkonnen', centre)!;
    expect(next).not.toBeNull();
    const [atreides, harkonnen] = [at(next, 'atreides'), at(next, 'harkonnen')];
    expect(piecesOverlapAt(atreides, atreides.position, harkonnen)).toBe(false);
    expect(insideTerritory(arrakeen, atreides)).toBe(true);
    expect(insideTerritory(arrakeen, harkonnen)).toBe(true);
    /* The dropped stack keeps the spot it was let go on; the one there moves over only a little. */
    expect(Math.hypot(harkonnen.position[0] - centre[0], harkonnen.position[2] - centre[2])).toBeLessThan(0.01);
    expect(Math.hypot(atreides.position[0] - centre[0], atreides.position[2] - centre[2])).toBeLessThan(0.5);
    expect(next.events[0]?.message).toContain('Arrakeen');
  });

  test('keep several factions inside the territory and clear of each other', () => {
    /* A stronghold holds two factions by the rules; Arrakeen has room for a third stack, such as a leader. */
    const factions = ['atreides', 'harkonnen', 'fremen'];
    let state = tableWith(...factions.map((faction, index) => troop(faction, faction, [-4.8 + index * 0.5, 0, 3.2])));
    for (const faction of factions) {
      state = dropAt(state, faction, centre)!;
      expect(state).not.toBeNull();
    }
    const placed = factions.map((faction) => at(state, faction));
    for (const piece of placed) {
      expect(insideTerritory(arrakeen, piece)).toBe(true);
      for (const other of placed) {
        if (other !== piece) {
          expect(piecesOverlapAt(piece, piece.position, other)).toBe(false);
        }
      }
    }
  });

  test('a stack let go across the border steps inside', () => {
    const border = arrakeen.rings[0]![0]!;
    const nearBorder: Vector3Tuple = [
      border[0] + (centre[0] - border[0]) * 0.1,
      0,
      border[1] + (centre[2] - border[1]) * 0.1,
    ];
    const state = tableWith(troop('atreides', 'atreides', SHELF));
    const next = dropAt(state, 'atreides', nearBorder)!;
    expect(insideTerritory(arrakeen, at(next, 'atreides'))).toBe(true);
  });

  test('played from a hand across the border step inside, as a carried one does', () => {
    const border = arrakeen.rings[0]![0]!;
    const nearBorder: Vector3Tuple = [
      border[0] + (centre[0] - border[0]) * 0.1,
      0,
      border[1] + (centre[2] - border[1]) * 0.1,
    ];
    const played = troop('played', 'atreides', nearBorder);
    const next = playFromHandSettled(tableWith(), played, nearBorder)!;
    expect(insideTerritory(arrakeen, at(next, 'played'))).toBe(true);
  });

  test('still join a stack of their own faction', () => {
    const state = tableWith(troop('placed', 'atreides', centre, 2), troop('held', 'atreides', SHELF, 3));
    const next = dropAt(state, 'held', centre)!;
    expect(next.pieces.filter((piece) => piece.owner === 'atreides')).toHaveLength(1);
    expect(at(next, 'placed').items).toHaveLength(5);
  });

  test('are refused when the territory has no room left', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      troop(`f${index}`, `faction-${index}`, [-4.9 + (index % 8) * 0.4, 0, 3.6 - Math.floor(index / 8) * 0.4])
    );
    let state = tableWith(...many);
    let refusal: string | undefined;
    for (const piece of many) {
      const next = dropAt(state, piece.id, centre);
      if (!next) {
        refusal = noRoomMessage(state, draftForGesture(at(state, piece.id), 'whole')!, centre);
        break;
      }
      state = next;
    }
    expect(refusal).toBe('Arrakeen has no room for that.');
    for (const piece of state.pieces.filter((candidate) =>
      territoryContains(arrakeen, [candidate.position[0], candidate.position[2]])
    )) {
      expect(insideTerritory(arrakeen, piece)).toBe(true);
    }
  });

  test('keep clear of a card by its real outline, not the circle round its corners', () => {
    const card: TablePiece = {
      ...cardBase,
      id: 'card',
      orientation: 0,
      position: restingPositionAt([0.516, 0, -3.045], cardBase),
    };
    const stack = troop('atreides', 'atreides', SHELF);
    const spot: Vector3Tuple = [1.316, 0, -2.945];
    expect(insideTerritory(arrakeen, { ...stack, position: restingPositionAt(spot, stack) })).toBe(true);
    expect(piecesOverlapAt(stack, restingPositionAt(spot, stack), card)).toBe(false);
    const landing = territoryLanding({}, stack, spot, [card, stack])!.position;
    expect(Math.hypot(landing[0] - spot[0], landing[2] - spot[2])).toBeLessThan(0.01);
  });
});
