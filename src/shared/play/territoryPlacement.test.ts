import { describe, expect, test } from 'vite-plus/test';

import { rotatedPiece } from './commands';
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
  restingPart,
  restsNarrowly,
  shareOutside,
  tableSectorAt,
  tableTerritories,
  territoryBounds,
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

  test('overlap the stacks already there once the territory is full, and are refused only when that leaves no room', () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      troop(`f${index}`, `faction-${index}`, [-4.9 + (index % 8) * 0.4, 0, 3.6 - Math.floor(index / 8) * 0.4])
    );
    let state = tableWith(...many);
    let refusal: string | undefined;
    let overlapped = 0;
    for (const piece of many) {
      const next = dropAt(state, piece.id, centre);
      if (!next) {
        refusal = noRoomMessage(state, draftForGesture(at(state, piece.id), 'whole')!, centre);
        break;
      }
      const landed = at(next, piece.id);
      const already = state.pieces.filter(
        (candidate) =>
          candidate.id !== piece.id && territoryContains(arrakeen, [candidate.position[0], candidate.position[2]])
      );
      const covered = already.filter((candidate) => piecesOverlapAt(landed, landed.position, at(next, candidate.id)));
      overlapped += covered.length > 0 ? 1 : 0;
      /* A stack resting over another still turns in place, keeping its lift. */
      const turned = covered.length > 0 ? rotatedPiece(next, landed, 1) : landed;
      expect(turned?.position).toEqual(landed.position);
      /* An overlapping stack rests a hair above the ones it covers, and leaves them where they were. */
      for (const candidate of covered) {
        expect(landed.position[1]).toBeGreaterThan(candidate.position[1]);
        expect(at(next, candidate.id).position).toEqual(candidate.position);
      }
      expect(territoryContains(arrakeen, [landed.position[0], landed.position[2]])).toBe(true);
      state = next;
    }
    expect(overlapped).toBeGreaterThan(0);
    expect(refusal).toBe('Arrakeen has no room for that.');
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
  const part = restingPart(territoryNamed(name), point);
  return { sector: tableSectorAt(point), rests: restsInside(part, point, radius) };
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
    const [x, z] = innermostPoint(restingPart(territoryNamed(erg), [onTheLine[0], onTheLine[2]]));
    const spot: Vector3Tuple = [x, 0, z];
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', spot)!, 'mover');
    expect(Math.hypot(moved.position[0] - spot[0], moved.position[2] - spot[2])).toBeLessThan(1e-6);
  });

  test('fill their sector, then overlap the stacks there, never moved into the next sector', () => {
    const many = Array.from({ length: 12 }, (_, index) => troop(`f${index}`, `faction-${index}`, SHELF));
    let state = tableWith(...many);
    for (const piece of many) {
      const next = dropAt(state, piece.id, onTheLine);
      expect(next).not.toBeNull();
      state = next!;
    }
    const dropped = state.pieces.filter((piece) =>
      territoryContains(territoryNamed(erg), [piece.position[0], piece.position[2]])
    );
    expect(dropped).toHaveLength(12);
    for (const piece of dropped) {
      expect(tableSectorAt([piece.position[0], piece.position[2]])).toBe(8);
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
    const part = restingPart(square, point);
    expect(shareOutside(part, point, 0.175)).toBeCloseTo(0.447, 2);
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
        const share = (territory: TableTerritory) => shareOutside(restingPart(territory, point), point, 0.175);
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
    const part = restingPart(territoryNamed('Meridian'), point);
    expect(shareOutside(part, point, 0.175)).toBeGreaterThan(0.3);
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
    const part = restingPart(pocket, [2, 0.36]);
    expect(part.id).toBe('pocket@0');
    /* Let go a hair off the spot it rests at, it still finds the pocket, though the grid's spots step it in from the border short of the 30% that allows. */
    for (const x of [1.95, 2.01, 2.05, 2.1]) {
      const near = restingPart(pocket, [x, 0.36]);
      expect(near.id).toBe('pocket@0');
    }
    const landing = fitIntoTerritory({
      territory: part,
      bodies: [{ id: 'troop', radius: 0.175, at: [2.1, 0.36] }],
      pinFirst: false,
      obstacles: [],
    });
    const at = landing!.get('troop')!;
    expect(restsInside(part, at, 0.175)).toBe(true);
  });

  test('the polar sink lies in no sector, so a stack rests where it was let go', () => {
    const spot: Vector3Tuple = [0.05, 0, 0.001];
    const state = tableWith(troop('mover', 'atreides', SHELF));
    const moved = at(dropAt(state, 'mover', spot)!, 'mover');
    expect(Math.hypot(moved.position[0] - spot[0], moved.position[2] - spot[2])).toBeLessThan(1e-6);
  });
});

describe('stacks dropped into the narrowest sectors of the official board', () => {
  /* Every real sector of every territory, by a few points inside it: slivers a line grazes off an outline are no sector of their own. */
  const sectors = tableTerritories(arrakisBoardCapture.definition).flatMap((territory) => {
    const box = territoryBounds(territory);
    const points = new Map<number, Vector3Tuple[]>();
    for (let x = box.minX; x <= box.maxX; x += 0.02) {
      for (let z = box.minZ; z <= box.maxZ; z += 0.02) {
        if (territoryContains(territory, [x, z])) {
          const sector = territory.sectored ? tableSectorAt([x, z]) : -1;
          points.set(sector, [...(points.get(sector) ?? []), [x, 0, z]]);
        }
      }
    }
    return [...points]
      .filter(([, inside]) => inside.length >= 25)
      .map(([sector, inside]) => ({ territory, sector, inside }));
  });
  const sectorOf = (piece: TablePiece) => tableSectorAt([piece.position[0], piece.position[2]]);

  test('cover every territory, Harg pass, False wall east and Tsimpo among them', () => {
    expect(sectors.filter(({ territory }) => territory.name === 'False wall east')).toHaveLength(5);
    expect(sectors.filter(({ territory }) => territory.name === 'Harg pass')).toHaveLength(2);
    /* Every real sector of the board, listed in full, so a thin one the sampling missed fails here. */
    expect(sectors).toHaveLength(86);
    expect(new Set(sectors.map(({ territory }) => territory.id)).size).toBe(
      tableTerritories(arrakisBoardCapture.definition).length
    );
  });

  /* The sector a stack let go at `point` lands in, -1 in the polar sink, or null when it is refused. */
  function landingSector(base: TablePiece, point: Vector3Tuple, territory: TableTerritory): number | null {
    const landing = territoryLanding({ board: arrakisBoardCapture.definition }, base, point, []);
    if (!landing) {
      return null;
    }
    return territory.sectored ? tableSectorAt([landing.position[0], landing.position[2]]) : -1;
  }

  const leader: TablePiece = { ...troop('leader', 'atreides', SHELF), stackKey: 'leader:atreides' };
  const byName = sectors.map((entry) => [`${entry.territory.name} sector ${entry.sector}`, entry] as const);

  test.each(byName)('rest in the sector they were let go in, troops and leaders alike: %s', (_, entry) => {
    const { territory, sector, inside } = entry;
    for (const point of inside.filter((_point, index) => index % Math.ceil(inside.length / 6) === 0)) {
      expect(landingSector(troop('mover', 'atreides', SHELF), point, territory)).toBe(sector);
      expect(landingSector(leader, point, territory)).toBe(sector);
    }
  });

  test.each(byName)('take three stacks of different factions, none moved into another sector: %s', (_, entry) => {
    const { territory, sector, inside } = entry;
    const many = Array.from({ length: 3 }, (_piece, index) => troop(`f${index}`, `faction-${index}`, SHELF));
    const drop = inside[Math.floor(inside.length / 2)]!;
    let state = tableWith(...many);
    for (const piece of many) {
      state = dropAt(state, piece.id, drop)!;
      expect(state).not.toBeNull();
    }
    for (const piece of state.pieces) {
      expect(territoryContains(territory, [piece.position[0], piece.position[2]])).toBe(true);
      expect(territory.sectored ? sectorOf(piece) : -1).toBe(sector);
    }
  });

  test('keep a leader as far inside a narrow sector as its own size needs, when troops crowd in beside it', () => {
    const sector = sectors.find(({ territory, sector: index }) => territory.name === 'False wall east' && index === 0)!;
    const drop = sector.inside[Math.floor(sector.inside.length / 2)]!;
    const leader: TablePiece = { ...troop('leader', 'atreides', SHELF), stackKey: 'leader:atreides' };
    const many = Array.from({ length: 3 }, (_, index) => troop(`f${index}`, `faction-${index}`, SHELF));
    let state: TableState = dropAt(tableWith(leader, ...many), 'leader', drop)!;
    for (const piece of many) {
      state = dropAt(state, piece.id, drop)!;
      expect(state).not.toBeNull();
    }
    const placed = at(state, 'leader');
    const point: [number, number] = [placed.position[0], placed.position[2]];
    expect(restsNarrowly(restingPart(sector.territory, point), point, footprintReach(placed))).toBe(true);
  });

  test('cover a stack in the next sector no more than any stack may be covered, however full their own', () => {
    const find = (index: number) =>
      sectors.find(({ territory, sector: candidate }) => territory.name === 'False wall east' && candidate === index)!;
    const neighbours = Array.from({ length: 3 }, (_, index) => troop(`n${index}`, `faction-n${index}`, SHELF));
    const movers = Array.from({ length: 6 }, (_, index) => troop(`m${index}`, `faction-m${index}`, SHELF));
    let state = tableWith(...neighbours, ...movers);
    const next = find(16).inside[Math.floor(find(16).inside.length / 2)]!;
    for (const piece of neighbours) {
      state = dropAt(state, piece.id, next)!;
    }
    const own = find(15).inside[Math.floor(find(15).inside.length / 2)]!;
    state = movers.reduce((current, piece) => dropAt(current, piece.id, own) ?? current, state);
    for (const mover of movers.map((piece) => at(state, piece.id))) {
      for (const neighbour of neighbours.map((piece) => at(state, piece.id))) {
        const apart = Math.hypot(mover.position[0] - neighbour.position[0], mover.position[2] - neighbour.position[2]);
        expect(apart).toBeGreaterThanOrEqual((footprintReach(mover) + footprintReach(neighbour)) * 0.3 - 1e-9);
      }
    }
  });
});
