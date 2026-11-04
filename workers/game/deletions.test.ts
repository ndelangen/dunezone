import { describe, expect, test } from 'vite-plus/test';

import { initialSnapshot } from '../../src/shared/play/commands';
import { nearestZone } from '../../src/shared/play/model';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { LEADER_SPACING, piecesOverlapAt } from '../../src/shared/play/tablePhysics';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';
import { DELETED_PIECES_LIMIT, RoomProjection } from './state';

type Identity = Parameters<Room['command']>[0];

const identity = (name: string, viewerSeat: string): Identity => ({
  connectionId: `${name}-connection`,
  userId: `${name}-user`,
  viewerSeat,
  displayName: name,
  color: '#d0c8b9',
});
const alice = identity('alice', 'harkonnen');
const bob = identity('bob', 'atreides');
const observer = identity('olga', 'spectator');
const FACTIONS: Record<string, string> = { [alice.userId]: 'harkonnen', [bob.userId]: 'atreides' };
const LOOSE = 'treachery-card-loose';

function room() {
  return new Room(
    { ...initialSnapshot(), roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    (id) => FACTIONS[id]
  );
}

const loose = (target: Room) => target.snapshot.table.pieces.find((piece) => piece.id === LOOSE);

/* Deletes the loose card face up and answers the deletion its log entry names. */
function deleted(target: Room) {
  const card = loose(target)!;
  const faceUp = { ...card, items: card.items.map((item) => ({ ...item, faceUp: true })) };
  target.accept({
    ...target.snapshot,
    table: {
      ...target.snapshot.table,
      pieces: target.snapshot.table.pieces.map((piece) => (piece.id === LOOSE ? faceUp : piece)),
    },
  });
  target.accept(target.command(alice, { kind: 'delete', pieceId: LOOSE }, target.snapshot.revision));
  return { card: faceUp, deletionId: String(target.snapshot.revision) };
}

describe('restoring a deleted piece (#2132)', () => {
  test('the game keeps a deleted piece whole, under the deletion its log entry names', () => {
    const target = room();
    const { card, deletionId } = deleted(target);
    expect(loose(target)).toBeUndefined();
    expect(target.snapshot.deletedPieces).toEqual([{ id: deletionId, piece: card }]);
  });

  test('a seated player brings it back where it lay, face down, and only once', () => {
    const target = room();
    const { card, deletionId } = deleted(target);
    target.accept(target.command(bob, { kind: 'restore', deletionId }, target.snapshot.revision));
    expect(loose(target)).toMatchObject({ position: card.position, items: [{ faceUp: false }] });
    expect(target.snapshot.deletedPieces).toEqual([]);
    expect(target.snapshot.table.events[0]?.message).toBe('Atreides restored Treachery card to the table, face down.');
    expect(() => target.command(bob, { kind: 'restore', deletionId }, target.snapshot.revision)).toThrow(
      'That piece can no longer be restored.'
    );
  });

  test('a piece whose spot is taken comes back at the nearest free spot', () => {
    const target = room();
    const { card, deletionId } = deleted(target);
    const other = target.snapshot.table.pieces.find((piece) => piece.kind === 'card')!;
    target.accept({
      ...target.snapshot,
      table: {
        ...target.snapshot.table,
        pieces: target.snapshot.table.pieces.map((piece) =>
          piece.id === other.id ? { ...piece, position: card.position } : piece
        ),
      },
    });
    target.accept(target.command(alice, { kind: 'restore', deletionId }, target.snapshot.revision));
    const back = loose(target)!;
    expect(back.position).not.toEqual(card.position);
    expect(piecesOverlapAt(back, back.position, { ...other, position: card.position })).toBe(false);
    expect(back.position).toEqual(restingPositionAt(back.position, back));
    expect(back.zoneId).toBe(nearestZone(back.position)?.id ?? null);
  });

  test('a leader restored in the Tanks rests on the leader disc it overlaps there', () => {
    const target = room();
    const troop = target.snapshot.table.pieces.find((piece) => piece.kind === 'force')!;
    const leader = (id: string, x: number) => ({
      ...troop,
      id,
      stackKey: `leader:harkonnen:${id}`,
      position: [x, 0.005, 7.5] as [number, number, number],
    });
    target.accept({
      ...target.snapshot,
      table: {
        ...target.snapshot.table,
        pieces: [...target.snapshot.table.pieces, leader('feyd', 0), leader('rabban', LEADER_SPACING + 0.01)],
      },
    });
    target.accept(target.command(alice, { kind: 'delete', pieceId: 'rabban' }, target.snapshot.revision));
    target.accept(
      target.command(alice, { kind: 'restore', deletionId: String(target.snapshot.revision) }, target.snapshot.revision)
    );
    const back = target.snapshot.table.pieces.find((piece) => piece.id === 'rabban')!;
    expect(back.position[0]).toBe(LEADER_SPACING + 0.01);
    expect(back.position[1]).toBeGreaterThan(0.005);
  });

  test('a fixture reset lets every kept deletion go', () => {
    const target = room();
    deleted(target);
    target.accept(target.command(alice, { kind: 'reset' }, target.snapshot.revision));
    expect(target.snapshot.deletedPieces).toEqual([]);
  });

  test('an observer cannot restore', () => {
    const target = room();
    const { deletionId } = deleted(target);
    expect(() => target.command(observer, { kind: 'restore', deletionId }, target.snapshot.revision)).toThrow();
    expect(loose(target)).toBeUndefined();
  });

  test('the game keeps only the latest deletions, and never sends them to anyone', () => {
    const target = room();
    deleted(target);
    target.accept({
      ...target.snapshot,
      deletedPieces: Array.from({ length: DELETED_PIECES_LIMIT }, (_, index) => ({
        id: `old-${index}`,
        piece: target.snapshot.deletedPieces[0]!.piece,
      })),
    });
    const tech = target.snapshot.table.pieces.find((piece) => piece.kind === 'card')!;
    target.accept(target.command(alice, { kind: 'delete', pieceId: tech.id }, target.snapshot.revision));
    expect(target.snapshot.deletedPieces).toHaveLength(DELETED_PIECES_LIMIT);
    expect(target.snapshot.deletedPieces.at(-1)?.piece.id).toBe(tech.id);
    expect(target.snapshot.deletedPieces[0]?.id).toBe('old-1');
    const projected = new RoomProjection('secret').snapshot(target.snapshot, 'harkonnen');
    expect(Object.keys(projected)).not.toContain('deletedPieces');
  });
});
