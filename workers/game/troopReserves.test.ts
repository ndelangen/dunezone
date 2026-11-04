import { describe, expect, test } from 'vite-plus/test';

import { factionTokenRingPose, factionTokenStackKey } from '../../src/shared/play/factionToken';
import type { TablePiece, Vector3Tuple } from '../../src/shared/play/model';
import { factionSupplyLayout } from '../../src/shared/play/setupLayout';
import { planarDistance, restingPositionAt } from '../../src/shared/play/tableGeometry';
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

function troops(id: string, stackKey: string, count: number, at: Vector3Tuple, faceUp = true): TablePiece {
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
    troops('regular-reserve', KINDS[0]!, 10, knocked),
    troops('elite-reserve', KINDS[1]!, 4, spots[1]!),
    troops('regular-board', KINDS[0]!, 3, [0.5, 0, 0.5], false),
    troops('elite-board', KINDS[1]!, 2, [-0.8, 0, 0.4]),
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

  test('without the dealt order, lay the kinds on the table out in key order', () => {
    const { table } = room();
    table.dealtTroops = () => undefined;
    const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
    dropOn(table, 'regular-board', token(table, 'harkonnen'));
    expect(planarDistance(piece(table, 'elite-reserve')!.position, spots[0]!)).toBeCloseTo(0);
    expect(planarDistance(piece(table, 'regular-reserve')!.position, spots[1]!)).toBeCloseTo(0);
  });

  test('gather a reserve split into two piles back into one', () => {
    const spots = factionSupplyLayout(angles[0]!, KINDS.length).reserves;
    const split = troops('regular-split', KINDS[0]!, 2, [spots[0]![0] - 0.35, 0, spots[0]![2] - 0.3]);
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
