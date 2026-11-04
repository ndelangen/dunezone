import { describe, expect, test } from 'vite-plus/test';

import { factionTokenRingPose, factionTokenStackKey } from '../../src/shared/play/factionToken';
import type { TablePiece, Vector3Tuple } from '../../src/shared/play/model';
import { factionSupplyLayout } from '../../src/shared/play/setupLayout';
import { BOARD_RIM_RADIUS, planarDistance, restingPositionAt } from '../../src/shared/play/tableGeometry';
import { isOverlapFreePosition } from '../../src/shared/play/tablePhysics';
import { tableSeatAngles } from '../../src/shared/play/tableSettings';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

const harkonnen = {
  connectionId: 'harkonnen-connection',
  userId: 'harkonnen-user',
  viewerSeat: 'harkonnen',
  displayName: 'Krell',
  color: '#ed927c',
};

const angles = tableSeatAngles(hostedFixturePlan.roster.seatCount);
const KINDS = ['troops:harkonnen:regular', 'troops:harkonnen:elite'];

function stand(piece: TablePiece, at: Vector3Tuple): TablePiece {
  return { ...piece, position: restingPositionAt(at, piece) };
}

function factionToken(factionId: string, angle: number): TablePiece {
  const pose = factionTokenRingPose(angle);
  return stand(
    {
      id: `token-${factionId}`,
      label: factionId,
      owner: 'shared',
      color: '#888888',
      accent: '#cccccc',
      items: [{ id: `token-${factionId}-1`, faceUp: true }],
      stackKey: factionTokenStackKey(factionId),
      position: pose.position,
      orientation: pose.orientation,
      zoneId: null,
      locked: false,
      kind: 'force',
    },
    pose.position
  );
}

type Troops = { id: string; stackKey: string; count: number; at: Vector3Tuple; faceUp?: boolean };

function troops({ id, stackKey, count, at, faceUp = true }: Troops): TablePiece {
  const factionId = stackKey.split(':')[1]!;
  return stand(
    {
      id,
      label: 'Troops',
      owner: factionId,
      color: '#888888',
      accent: '#cccccc',
      items: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, faceUp })),
      stackKey,
      position: at,
      orientation: 0.7,
      zoneId: null,
      locked: false,
      kind: 'force',
    },
    at
  );
}

/* Harkonnen's two reserves as setup dealt them, the regular one knocked aside, and 3 flipped regulars and 2 elites out on the board. */
function room(extra: TablePiece[] = []) {
  const snapshot = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
  const knocked: Vector3Tuple = [spots[0]![0] + 0.3, 0, spots[0]![2] + 0.25];
  const pieces = [
    factionToken('harkonnen', angles[0]!),
    factionToken('atreides', angles[1]!),
    troops({ id: 'regular-reserve', stackKey: KINDS[0]!, count: 10, at: knocked }),
    troops({ id: 'elite-reserve', stackKey: KINDS[1]!, count: 4, at: spots[1]! }),
    troops({ id: 'regular-board', stackKey: KINDS[0]!, count: 3, at: [0.5, 0, 0.5], faceUp: false }),
    troops({ id: 'elite-board', stackKey: KINDS[1]!, count: 2, at: [-0.8, 0, 0.4] }),
    ...extra,
  ];
  const table = new Room(
    {
      ...snapshot,
      table: { ...snapshot.table, pieces },
      versions: Object.fromEntries(pieces.map((piece) => [piece.id, 0])),
    },
    () => ['harkonnen', 'atreides'],
    (userId) => (userId === harkonnen.userId ? 'harkonnen' : undefined)
  );
  table.dealtTroops = () => KINDS;
  return { table, spots };
}

function dropOn(table: Room, sourcePieceId: string, at: Vector3Tuple, pickup: 'top' | 'whole' = 'whole') {
  const carryId = `carry-${sourcePieceId}-${pickup}`;
  table.begin(harkonnen, {
    carryId,
    sourcePieceId,
    expectedVersion: table.snapshot.versions[sourcePieceId]!,
    pickup,
  });
  table.accept(table.drop(harkonnen, carryId, { position: at, orientation: 0 }), carryId);
}

const piece = (table: Room, id: string) => table.snapshot.table.pieces.find((candidate) => candidate.id === id);
const token = (table: Room, factionId: string) => piece(table, `token-${factionId}`)!.position;

describe('troops let go over their own faction token', () => {
  test('join their reserve face up, and every reserve stands on its setup spot again', () => {
    const { table, spots } = room();
    dropOn(table, 'regular-board', token(table, 'harkonnen'));

    expect(piece(table, 'regular-board')).toBeUndefined();
    const regular = piece(table, 'regular-reserve')!;
    expect(regular.items).toHaveLength(13);
    expect(regular.items.every((item) => item.faceUp)).toBe(true);
    expect(planarDistance(regular.position, spots[0]!)).toBeCloseTo(0);
    expect(regular.orientation).toBe(0);
    expect(planarDistance(piece(table, 'elite-reserve')!.position, spots[1]!)).toBeCloseTo(0);
    expect(table.snapshot.table.events[0]).toMatchObject({
      command: 'troops.reserve',
      status: 'accepted',
      message: expect.stringMatching(/returned 3 troops to Harkonnen's reserves\.$/),
    });
  });

  test('taken off the top, only the troops in hand go back', () => {
    const { table } = room();
    dropOn(table, 'elite-board', token(table, 'harkonnen'), 'top');
    expect(piece(table, 'elite-board')!.items).toHaveLength(1);
    expect(piece(table, 'elite-reserve')!.items).toHaveLength(5);
  });

  test('lay the reserves out in the order the faction was dealt', () => {
    const { table } = room();
    table.dealtTroops = () => [...KINDS].reverse();
    const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
    dropOn(table, 'elite-board', token(table, 'harkonnen'));
    expect(planarDistance(piece(table, 'elite-reserve')!.position, spots[0]!)).toBeCloseTo(0);
    expect(planarDistance(piece(table, 'regular-reserve')!.position, spots[1]!)).toBeCloseTo(0);
  });

  test('without the dealt order, lay the kinds out in the order the table first lists them', () => {
    const { table, spots } = room();
    table.dealtTroops = () => undefined;
    dropOn(table, 'elite-board', token(table, 'harkonnen'));
    expect(planarDistance(piece(table, 'regular-reserve')!.position, spots[0]!)).toBeCloseTo(0);
    expect(planarDistance(piece(table, 'elite-reserve')!.position, spots[1]!)).toBeCloseTo(0);
  });

  describe('at the near edge, where the reserves stand by the join to the Tanks shelf', () => {
    const near = factionSupplyLayout(angles[3]!, KINDS.length).reserves;
    const seatedNear = (table: Room) => {
      table.snapshot = {
        ...table.snapshot,
        roster: {
          ...table.snapshot.roster!,
          seats: table.snapshot.roster!.seats.map((seat) =>
            seat.faction?.id === 'harkonnen' ? { ...seat, position: 3 } : seat
          ),
        },
      };
    };

    test('returned troops join the reserve there', () => {
      const reserve = troops({ id: 'regular-near', stackKey: KINDS[0]!, count: 10, at: near[0]! });
      const { table } = room([reserve]);
      seatedNear(table);
      dropOn(table, 'regular-board', token(table, 'harkonnen'));
      expect(piece(table, 'regular-near')!.items).toHaveLength(13);
      expect(piece(table, 'regular-board')).toBeUndefined();
    });

    test('dead troops in the Tanks stay where they are', () => {
      const tanks = troops({ id: 'regular-tanks', stackKey: KINDS[0]!, count: 2, at: [0.3, 0, 5.7] });
      expect(planarDistance(tanks.position, near[0]!)).toBeLessThan(1);
      const { table } = room([tanks]);
      seatedNear(table);
      dropOn(table, 'regular-board', token(table, 'harkonnen'));
      expect(piece(table, 'regular-tanks')!.items).toHaveLength(2);
      expect(piece(table, 'regular-tanks')!.position).toEqual(tanks.position);
    });
  });

  test('gather a reserve split into two piles back into one', () => {
    const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
    const split = troops({
      id: 'regular-split',
      stackKey: KINDS[0]!,
      count: 2,
      at: [spots[0]![0] - 0.35, 0, spots[0]![2] - 0.3],
    });
    const { table } = room([split]);
    dropOn(table, 'regular-board', token(table, 'harkonnen'));
    expect(piece(table, 'regular-split')).toBeUndefined();
    expect(piece(table, 'regular-reserve')!.items).toHaveLength(15);
  });

  test('become the reserve when none is left behind the seat', () => {
    const { table, spots } = room();
    dropOn(table, 'elite-reserve', [0, 0, 0]);
    dropOn(table, 'elite-board', token(table, 'harkonnen'));
    const reserve = piece(table, 'elite-board')!;
    expect(reserve.items).toHaveLength(2);
    expect(planarDistance(reserve.position, spots[1]!)).toBeCloseTo(0);
  });

  test('leave reserves on the board where they are', () => {
    const { table } = room();
    dropOn(table, 'regular-board', token(table, 'harkonnen'));
    expect(piece(table, 'elite-board')!.items).toHaveLength(2);
    expect(planarDistance(piece(table, 'elite-board')!.position, [-0.8, 0, 0.4])).toBeCloseTo(0);
  });
});

describe('at a seat down the side of the table', () => {
  const ATREIDES = ['troops:atreides:regular', 'troops:atreides:elite'];
  const spots = factionSupplyLayout(angles[1]!, ATREIDES.length).reserves;

  test('the smaller reserve takes the spot nearer the bottom of the screen, so the taller one never hides it', () => {
    /* Setup dealt the 10 regulars on the lower spot and the 3 elites on the higher one. */
    expect(spots[0]![2]).toBeGreaterThan(spots[1]![2]);
    const { table } = room([
      troops({ id: 'atreides-regular', stackKey: ATREIDES[0]!, count: 10, at: spots[0]! }),
      troops({ id: 'atreides-elite', stackKey: ATREIDES[1]!, count: 3, at: spots[1]! }),
      troops({ id: 'atreides-board', stackKey: ATREIDES[1]!, count: 1, at: [0.9, 0, -0.6] }),
    ]);
    table.dealtTroops = (factionId) => (factionId === 'atreides' ? ATREIDES : KINDS);
    dropOn(table, 'atreides-board', token(table, 'atreides'));
    expect(piece(table, 'atreides-elite')!.items).toHaveLength(4);
    expect(planarDistance(piece(table, 'atreides-elite')!.position, spots[0]!)).toBeCloseTo(0);
    expect(planarDistance(piece(table, 'atreides-regular')!.position, spots[1]!)).toBeCloseTo(0);
  });
});

describe('reserves kept clear of what stays put', () => {
  test('a locked pile on a reserve spot keeps its place, and the returned troops stand clear of it', () => {
    const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
    const { table } = room();
    table.snapshot = {
      ...table.snapshot,
      table: {
        ...table.snapshot.table,
        pieces: table.snapshot.table.pieces.map((candidate) =>
          candidate.id === 'regular-reserve' ? { ...candidate, position: spots[0]!, locked: true } : candidate
        ),
      },
    };
    dropOn(table, 'regular-board', token(table, 'harkonnen'));
    const locked = piece(table, 'regular-reserve')!;
    const returned = piece(table, 'regular-board')!;
    expect(locked.items).toHaveLength(10);
    expect(planarDistance(locked.position, spots[0]!)).toBeCloseTo(0);
    expect(returned.items).toHaveLength(3);
    expect(isOverlapFreePosition(returned, returned.position, [locked])).toBe(true);
  });
});

describe('reserve spots crowded by other pieces', () => {
  test('a returned reserve never lands where the next return would miss it', () => {
    const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
    /* Locked Atreides piles crowd the table round the Harkonnen reserve spots, leaving no room near them. */
    const grid = Array.from({ length: 13 }, (_, step) => (step - 6) * 0.3);
    const blockers = grid
      .flatMap((x) => grid.map((dz) => [spots[0]![0] + x + 0.2, 0, spots[0]![2] + dz] as Vector3Tuple))
      .filter((at) => Math.hypot(at[0], at[2]) <= 5.4 && spots.some((spot) => planarDistance(at, spot) <= 1.4))
      .map((at, index) => ({
        ...troops({ id: `blocker-${index}`, stackKey: 'troops:atreides:blocker', count: 1, at }),
        locked: true,
      }));
    const { table } = room(blockers);
    let refused: unknown;
    try {
      dropOn(table, 'regular-board', token(table, 'harkonnen'));
    } catch (error) {
      refused = error;
    }
    const harkonnen = table.snapshot.table.pieces.filter((candidate) => candidate.stackKey === KINDS[0]);
    const reachable = (position: Vector3Tuple) =>
      Math.hypot(position[0], position[2]) > BOARD_RIM_RADIUS &&
      spots.some((spot) => planarDistance(position, spot) <= 1);
    if (refused) {
      expect(piece(table, 'regular-board')!.items).toHaveLength(3);
    } else {
      expect(harkonnen.filter((pile) => !reachable(pile.position))).toEqual([]);
    }
  });
});

describe('four troop kinds at a seat down the side of the table', () => {
  const FOUR = ['a', 'b', 'c', 'd'].map((kind) => `troops:atreides:${kind}`);
  const spots = factionSupplyLayout(angles[1]!, FOUR.length).reserves;

  test('a reserve moved to another kind’s spot is still found by the next return', () => {
    const { table } = room([
      ...[10, 8, 6, 2].map((count, index) =>
        troops({ id: `atreides-${index}`, stackKey: FOUR[index]!, count, at: spots[index]! })
      ),
      troops({ id: 'atreides-board-1', stackKey: FOUR[3]!, count: 1, at: [0.9, 0, -0.6] }),
      troops({ id: 'atreides-board-2', stackKey: FOUR[3]!, count: 1, at: [-0.9, 0, 0.9] }),
    ]);
    table.dealtTroops = (factionId) => (factionId === 'atreides' ? FOUR : KINDS);
    dropOn(table, 'atreides-board-1', token(table, 'atreides'));
    dropOn(table, 'atreides-board-2', token(table, 'atreides'));
    const smallest = table.snapshot.table.pieces.filter((candidate) => candidate.stackKey === FOUR[3]);
    expect(smallest.map((candidate) => candidate.items.length)).toEqual([4]);
  });
});

describe('troops let go over another faction token', () => {
  test('are set down as any piece is, and no reserve moves', () => {
    const { table } = room();
    const before = piece(table, 'regular-reserve')!.position;
    dropOn(table, 'regular-board', token(table, 'atreides'));
    expect(piece(table, 'regular-board')!.items).toHaveLength(3);
    expect(piece(table, 'regular-reserve')!.position).toEqual(before);
    expect(table.snapshot.table.events[0]?.command).not.toBe('troops.reserve');
  });
});
