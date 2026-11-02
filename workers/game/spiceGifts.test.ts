import { describe, expect, test } from 'vite-plus/test';

import { bribePilePosition, factionTokenUnder } from '../../src/shared/play/bribes';
import { factionTokenRingPose, factionTokenStackKey } from '../../src/shared/play/factionToken';
import type { TablePiece } from '../../src/shared/play/model';
import { clientMessageSchema } from '../../src/shared/play/protocol';
import { isSpicePiece } from '../../src/shared/play/spice';
import { createSpiceStack } from '../../src/shared/play/spiceBank';
import { planarDistance, restingPositionAt } from '../../src/shared/play/tableGeometry';
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
const observer = { ...harkonnen, connectionId: 'observer', userId: 'observer-user', viewerSeat: 'neutral' };

function factionToken(factionId: string, angle: number): TablePiece {
  const pose = factionTokenRingPose(angle);
  const piece: TablePiece = {
    id: `token-${factionId}`,
    label: factionId,
    owner: 'shared',
    color: '#888888',
    accent: '#cccccc',
    items: [{ id: `token-${factionId}-1`, faceUp: true }],
    stackKey: factionTokenStackKey(factionId),
    position: pose.position,
    orientation: pose.orientation,
    flipRevision: 0,
    zoneId: null,
    locked: false,
    kind: 'force',
  };
  return { ...piece, position: restingPositionAt(piece.position, piece) };
}

function room() {
  const snapshot = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  const angles = tableSeatAngles(hostedFixturePlan.roster.seatCount);
  const spice = createSpiceStack(900, 5);
  const pieces = [factionToken('harkonnen', angles[0]!), factionToken('atreides', angles[1]!), spice];
  const table = new Room(
    {
      ...snapshot,
      table: { ...snapshot.table, pieces },
      versions: Object.fromEntries(pieces.map((piece) => [piece.id, 0])),
      factionBanks: { harkonnen: 0, atreides: 4 },
    },
    () => ['harkonnen', 'atreides'],
    (userId) => (userId === harkonnen.userId ? 'harkonnen' : undefined)
  );
  return { table, spice, atreides: pieces[1]! };
}

function carry(table: Room, sourcePieceId: string, carryId: string, pickup: 'top' | 'whole' = 'whole') {
  table.begin(harkonnen, {
    carryId,
    sourcePieceId,
    expectedVersion: table.snapshot.versions[sourcePieceId]!,
    pickup,
  });
}

describe('spice given on a faction token', () => {
  test('a payment goes into that faction’s spice reserve and off the table', () => {
    const { table, spice, atreides } = room();
    carry(table, spice.id, 'pay');
    table.accept(
      table.drop(harkonnen, 'pay', {
        position: atreides.position,
        orientation: 0,
        give: { as: 'payment', factionId: 'atreides' },
      }),
      'pay'
    );
    expect(table.snapshot.factionBanks).toEqual({ harkonnen: 0, atreides: 9 });
    expect(table.snapshot.table.pieces.filter(isSpicePiece)).toEqual([]);
    expect(table.snapshot.table.events[0]).toMatchObject({
      command: 'spice.pay',
      message: 'Harkonnen paid 5 spice to Atreides.',
    });
  });

  test('a bribe lands on that faction’s bribe pile, and the next bribe joins it', () => {
    const { table, spice, atreides } = room();
    const pile = bribePilePosition(table.snapshot.table.pieces, table.snapshot.roster, 'atreides')!;
    carry(table, spice.id, 'first', 'top');
    table.accept(
      table.drop(harkonnen, 'first', {
        position: atreides.position,
        orientation: 0,
        give: { as: 'bribe', factionId: 'atreides' },
      }),
      'first'
    );
    carry(table, spice.id, 'second', 'top');
    table.accept(
      table.drop(harkonnen, 'second', {
        position: atreides.position,
        orientation: 0,
        give: { as: 'bribe', factionId: 'atreides' },
      }),
      'second'
    );
    const stacks = table.snapshot.table.pieces.filter(isSpicePiece);
    const bribe = stacks.find((piece) => planarDistance(piece.position, pile) < 0.01);
    expect(bribe?.items).toHaveLength(2);
    expect(stacks.reduce((sum, piece) => sum + piece.items.length, 0)).toBe(5);
    expect(table.snapshot.factionBanks).toEqual({ harkonnen: 0, atreides: 4 });
    expect(table.snapshot.table.events[0]).toMatchObject({
      command: 'spice.bribe',
      message: 'Harkonnen bribed Atreides with 1 spice.',
    });
  });

  test('spice cannot be given to the giver’s own faction, away from a token, or by an observer', () => {
    const { table, spice } = room();
    const own = table.snapshot.table.pieces.find((piece) => piece.id === 'token-harkonnen')!;
    carry(table, spice.id, 'own');
    expect(() =>
      table.drop(harkonnen, 'own', {
        position: own.position,
        orientation: 0,
        give: { as: 'payment', factionId: 'harkonnen' },
      })
    ).toThrow("another faction's token");
    expect(() =>
      table.drop(harkonnen, 'own', {
        position: [0, 0, 0],
        orientation: 0,
        give: { as: 'bribe', factionId: 'atreides' },
      })
    ).toThrow("another faction's token");
    expect(() =>
      table.begin(observer, { carryId: 'watch', sourcePieceId: spice.id, expectedVersion: 0, pickup: 'whole' })
    ).toThrow();
    expect(table.snapshot.factionBanks).toEqual({ harkonnen: 0, atreides: 4 });
  });

  test('a gift offered to one faction is refused when another faction’s token now stands there', () => {
    const { table, spice, atreides } = room();
    carry(table, spice.id, 'swapped');
    expect(() =>
      table.drop(harkonnen, 'swapped', {
        position: atreides.position,
        orientation: 0,
        give: { as: 'payment', factionId: 'emperor' },
      })
    ).toThrow("another faction's token");
    expect(table.snapshot.factionBanks).toEqual({ harkonnen: 0, atreides: 4 });
  });

  test('only spice can be given', () => {
    const { table, atreides } = room();
    const own = 'token-harkonnen';
    carry(table, own, 'token');
    expect(() =>
      table.drop(harkonnen, 'token', {
        position: atreides.position,
        orientation: 0,
        give: { as: 'payment', factionId: 'atreides' },
      })
    ).toThrow();
  });

  test('the wire carries the choice on the drop', () => {
    const drop = { type: 'drop', commandId: 'c', carryId: 'k', position: [0, 0, 0], orientation: 0 };
    expect(clientMessageSchema.safeParse({ ...drop, give: { as: 'bribe', factionId: 'atreides' } }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ ...drop, give: { as: 'payment', factionId: 'atreides' } }).success).toBe(
      true
    );
    expect(clientMessageSchema.safeParse({ ...drop, give: { as: 'gift', factionId: 'atreides' } }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ ...drop, give: 'bribe' }).success).toBe(false);
  });
});

describe('bribe piles', () => {
  test('a bribe pile keeps clear of the token and stands on the table', () => {
    const { table } = room();
    const pieces = table.snapshot.table.pieces.filter((piece) => !isSpicePiece(piece));
    const pile = { ...createSpiceStack(1, 3) };
    const position = bribePilePosition(pieces, table.snapshot.roster, 'atreides')!;
    expect(isOverlapFreePosition(pile, restingPositionAt(position, pile), pieces)).toBe(true);
    expect(factionTokenUnder(pieces, position)).toBeUndefined();
  });
});
