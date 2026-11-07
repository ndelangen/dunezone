import { describe, expect, test } from 'vite-plus/test';

import { arrakisBoardCapture } from './fixtures/board';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { restingPositionAt } from './tableGeometry';
import { footprintReach, piecesOverlapAt } from './tablePhysics';
import { TABLE_SECTOR_COUNT } from './tableSettings';
import {
  applyDraftToState,
  draftForGesture,
  noRoomMessage,
  playFromHandSettled,
  settleCarryAtPosition,
} from './tableState';
import {
  fitIntoTerritory,
  restsInside,
  innermostPoint,
  restingParts,
  shareOutside,
  tableSectorAt,
  tableTerritories,
  territoryContains,
} from './territoryFit';
import type { TableTerritory } from './territoryFit';
import { keepsInsideTerritory, territoryLanding } from './territoryPlacement';

const troopBase = freshTableState().pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
const cardBase = freshTableState().pieces.find((piece) => piece.kind === 'card')!;

function territoryNamed(name: string): TableTerritory {
  return tableTerritories(arrakisBoardCapture.definition).find((territory) => territory.name === name)!;
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
  return { ...freshTableState(), board: arrakisBoardCapture.definition, pieces, selectedPieceId: null };
}

const at = (state: TableState, id: string) => state.pieces.find((piece) => piece.id === id)!;

function dropAt(state: TableState, id: string, position: Vector3Tuple) {
  const draft = draftForGesture(at(state, id), 'whole')!;
  const settled = settleCarryAtPosition(state, draft, position);
  return settled ? applyDraftToState(state, settled) : null;
}

function insideTerritory(territory: TableTerritory, piece: TablePiece) {
  return restsInside(territory, [piece.position[0], piece.position[2]], footprintReach(piece));
}

/* A point a tenth of the way from the territory's first border corner towards its middle: a stack there straddles the border. */
function justInsideBorder(territory: TableTerritory, centre: Vector3Tuple): Vector3Tuple {
  const border = territory.rings[0]![0]!;
  return [border[0] + (centre[0] - border[0]) * 0.1, 0, border[1] + (centre[2] - border[1]) * 0.1];
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
    const nearBorder = justInsideBorder(arrakeen, centre);
    const state = tableWith(troop('atreides', 'atreides', SHELF));
    const next = dropAt(state, 'atreides', nearBorder)!;
    expect(insideTerritory(arrakeen, at(next, 'atreides'))).toBe(true);
  });

  test('played from a hand across the border step inside, as a carried one does', () => {
    const nearBorder = justInsideBorder(arrakeen, centre);
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
    const landing = territoryLanding({ board: arrakisBoardCapture.definition }, stack, spot, [card, stack])!.position;
    expect(Math.hypot(landing[0] - spot[0], landing[2] - spot[2])).toBeLessThan(0.01);
  });

  test.each([
    ['Cielago depression', [0.614, 0, 2.51]],
    ['Carthag', [-0.439, 0, -2.749]],
  ] as const)('find room for a leader in an empty %s, however narrow the pocket it fits in', (name, spot) => {
    /* A search on a few directions, or on coarse rings, missed these pockets and called an empty territory full. */
    const leader: TablePiece = {
      ...troopBase,
      id: 'leader',
      stackKey: 'leader:atreides',
      items: [{ id: 'l', faceUp: true }],
    };
    const at: Vector3Tuple = [...spot];
    const landing = territoryLanding(
      { board: arrakisBoardCapture.definition },
      { ...leader, position: restingPositionAt(at, leader) },
      at,
      []
    );
    expect(landing).toBeTruthy();
    expect(insideTerritory(territoryNamed(name), { ...leader, position: landing!.position })).toBe(true);
  });

  test('placed as any other piece, a stack is never left across a border, though a card may be', () => {
    const inside = (piece: TablePiece, point: Vector3Tuple) =>
      keepsInsideTerritory({ board: arrakisBoardCapture.definition }, piece, [])(point);
    const stack = troop('atreides', 'atreides', SHELF);
    const straddling = justInsideBorder(arrakeen, centre);
    expect(inside(stack, centre)).toBe(true);
    expect(inside(stack, straddling)).toBe(false);
    expect(inside(stack, SHELF)).toBe(true);
    expect(inside({ ...cardBase, id: 'card' }, straddling)).toBe(true);
  });
});

/* The sector a stack's centre is in, and whether it rests in that sector's part of its territory, no more than 30% of it outside. */
function inOneSector(piece: TablePiece, name: string) {
  const point: [number, number] = [piece.position[0], piece.position[2]];
  const radius = footprintReach(piece);
  const [part] = restingParts(territoryNamed(name), point, radius);
  return { sector: tableSectorAt(point), rests: restsInside(part!, point, radius) };
}

describe('stacks dropped across a sector line', () => {
  /* The line at 160° runs through the Habbanya erg, between sectors 7 and 8; a nudge either way picks the side. */
  const line = (8 * Math.PI * 2) / TABLE_SECTOR_COUNT;
  const across = (r: number, side: number): Vector3Tuple => [
    r * Math.cos(line) - Math.sin(line) * side,
    0,
    r * Math.sin(line) + Math.cos(line) * side,
  ];
  const onTheLine = across(2.75, 0.001);
  const erg = 'Habbanya erg';

  test('step into the sector they were let go in, no more than 30% of them over the line', () => {
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', onTheLine)!, 'mover');
    expect(inOneSector(moved, erg)).toEqual({ sector: 8, rests: true });
    expect(Math.hypot(moved.position[0] - onTheLine[0], moved.position[2] - onTheLine[2])).toBeLessThan(0.3);
  });

  test('let go just over the line, rest in the other sector', () => {
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', across(2.75, -0.001))!, 'mover');
    expect(inOneSector(moved, erg)).toEqual({ sector: 7, rests: true });
  });

  test('already standing clear in a sector, stay where they were let go', () => {
    const radius = footprintReach(troopBase);
    const [x, z] = innermostPoint(restingParts(territoryNamed(erg), [onTheLine[0], onTheLine[2]], radius)[0]!);
    const spot: Vector3Tuple = [x, 0, z];
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', spot)!, 'mover');
    expect(Math.hypot(moved.position[0] - spot[0], moved.position[2] - spot[2])).toBeLessThan(1e-6);
  });

  test('fill their sector and are then refused, never moved into the next sector', () => {
    const many = Array.from({ length: 12 }, (_, index) => troop(`f${index}`, `faction-${index}`, SHELF));
    let state = tableWith(...many);
    let refused = false;
    for (const piece of many) {
      const next = dropAt(state, piece.id, onTheLine);
      if (!next) {
        refused = true;
        break;
      }
      state = next;
    }
    expect(refused).toBe(true);
    const dropped = state.pieces.filter((piece) =>
      territoryContains(territoryNamed(erg), [piece.position[0], piece.position[2]])
    );
    expect(dropped.length).toBeGreaterThan(1);
    for (const piece of dropped) {
      expect(inOneSector(piece, erg)).toEqual({ sector: 8, rests: true });
    }
  });

  test('never hang more than 30% out of a territory at a corner', () => {
    /* Two borders of The greater flat meet here, and a check against each edge alone left over half a troop outside. */
    const corner: Vector3Tuple = [-1.2874, 0, 0.00851];
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', corner)!, 'mover');
    const point: [number, number] = [moved.position[0], moved.position[2]];
    expect(shareOutside(territoryNamed('The greater flat'), point, footprintReach(moved))).toBeLessThanOrEqual(0.3);
  });

  test('in a territory too narrow for one sector, leave the stacks already there in their sectors', () => {
    const territory = territoryNamed('False wall east');
    const [x, z] = innermostPoint(territory);
    const many = Array.from({ length: 8 }, (_, index) => troop(`f${index}`, `faction-${index}`, SHELF));
    let state = tableWith(...many);
    for (const [index, piece] of many.entries()) {
      const before = new Map(
        state.pieces.map((candidate) => [candidate.id, tableSectorAt([candidate.position[0], candidate.position[2]])])
      );
      const next = dropAt(state, piece.id, [x, 0, z]);
      if (index === 0) {
        expect(next).not.toBeNull();
      }
      if (!next) {
        break;
      }
      for (const moved of next.pieces.filter((candidate) => candidate.id !== piece.id)) {
        expect(tableSectorAt([moved.position[0], moved.position[2]])).toBe(before.get(moved.id));
      }
      state = next;
    }
  });

  test('count a hole a sector line cuts through as a hole, though it touches the outline there', () => {
    /* Clipped to sector 0, the hole's first corner lands on the outer ring's edge along the line. */
    const square: TableTerritory = {
      id: 'square',
      name: 'Square',
      sectored: true,
      rings: [
        [
          [1, -1],
          [3.2, -1],
          [3.2, 1.8],
          [1, 1.8],
        ],
        [
          [2, 1.4],
          [2, 0.4],
          [3, 0.4],
          [3, 1.4],
        ],
      ],
    };
    const point: [number, number] = [1.92, 0.62];
    const [part] = restingParts(square, point, 0.175);
    expect(shareOutside(part!, point, 0.175)).toBeCloseTo(0.447, 2);
  });

  test('let a troop in beside a leader the whole territory took across a line', () => {
    const leader: TablePiece = {
      ...troop('leader', 'atreides', [-0.18037, 0, -1.16891]),
      stackKey: 'leader:atreides',
    };
    const leaderLanding = territoryLanding({ board: arrakisBoardCapture.definition }, leader, leader.position, []);
    const placed = { ...leader, position: leaderLanding ? leaderLanding.position : leader.position };
    const spot: Vector3Tuple = [-0.36037, 0, -2.08891];
    const state = tableWith(placed, troop('mover', 'harkonnen', SHELF));
    expect(dropAt(state, 'mover', spot)).not.toBeNull();
  });

  test('read the Habbanya ridge flat the same wherever its hole ring starts', () => {
    const flat = territoryNamed('Habbanya ridge flat');
    const shifted = { ...flat, rings: flat.rings.map((ring, i) => (i === 0 ? ring : [...ring.slice(1), ring[0]!])) };
    for (let x = -4; x < 0; x += 0.1) {
      for (let z = 0; z < 4; z += 0.1) {
        const point: [number, number] = [x, z];
        const share = (territory: TableTerritory) =>
          shareOutside(restingParts(territory, point, 0.175)[0]!, point, 0.175);
        expect(share(shifted)).toBeCloseTo(share(flat), 6);
      }
    }
  });

  test('count a side that only touches a footprint as outside it', () => {
    const square = {
      rings: [
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ] as [number, number][],
      ],
    };
    /* The top side touches the circle at its middle and nowhere else. */
    expect(shareOutside(square, [0, 1.175], 0.175)).toBeCloseTo(1, 6);
  });

  test('measure a Meridian troop by the arc where a side only touches it', () => {
    const point: [number, number] = [-0.5208375976749681, 3.1751132841840155];
    const [part] = restingParts(territoryNamed('Meridian'), point, 0.175);
    expect(shareOutside(part!, point, 0.175)).toBeGreaterThan(0.3);
  });

  test('keep a troop in a narrow pocket of its sector when it rests there, though no sampled spot does', () => {
    const h = 0.1287;
    /* A pocket in sector 0, joined by a thin corridor to a roomier stretch in sector 1. */
    const pocket: TableTerritory = {
      id: 'pocket',
      name: 'Pocket',
      sectored: true,
      rings: [
        [
          [2 - h, 0.36 - h],
          [2 + h, 0.36 - h],
          [2 + h, 0.36 + h],
          [2.03, 0.36 + h],
          [2.03, 1],
          [2.4, 1],
          [2.4, 1.4],
          [1.8, 1.4],
          [1.8, 1],
          [2, 1],
          [2, 0.36 + h],
          [2 - h, 0.36 + h],
        ],
      ],
    };
    const [part] = restingParts(pocket, [2, 0.36], 0.175);
    expect(part!.id).toBe('pocket@0');
    /* Let go a hair off the spot it rests at, it still finds the pocket, though the grid's spots step it in from the border short of the 30% that allows. */
    for (const x of [1.95, 2.01, 2.05, 2.1]) {
      const [near] = restingParts(pocket, [x, 0.36], 0.175);
      expect(near!.id).toBe('pocket@0');
    }
    const landing = fitIntoTerritory({
      territory: part!,
      bodies: [{ id: 'troop', radius: 0.175, at: [2.1, 0.36] }],
      pinFirst: false,
      obstacles: [],
    });
    const at = landing!.get('troop')!;
    expect(restsInside(part!, at, 0.175)).toBe(true);
  });

  test('the polar sink lies in no sector, so a stack rests where it was let go', () => {
    const spot: Vector3Tuple = [0.05, 0, 0.001];
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', spot)!, 'mover');
    expect(Math.hypot(moved.position[0] - spot[0], moved.position[2] - spot[2])).toBeLessThan(1e-6);
  });
});
