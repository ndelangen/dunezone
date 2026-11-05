import { expect, test } from 'vite-plus/test';

import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { piecesCanStack } from '../../src/shared/play/tablePhysics';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';
import { RoomProjection } from './state';

type Identity = Parameters<Room['command']>[0];
type RoomAction = Parameters<Room['command']>[1];

const bob: Identity = {
  connectionId: 'bob-connection',
  userId: 'bob-user',
  viewerSeat: 'atreides',
  displayName: 'bob',
  color: '#d0c8b9',
};
const LEADER = 'paul-disc';
const FRONT = 'https://example.test/paul.png';
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;

/* The fixture table with one face-up leader disc on it, as a leader lies after a battle's reveal. */
function room() {
  const snapshot = { ...initialSnapshot(), roster: hostedFixturePlan.roster };
  const troop = snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  snapshot.table.pieces.push({
    ...structuredClone(troop),
    id: LEADER,
    owner: 'atreides',
    label: 'Paul',
    stackKey: 'leader:atreides:paul',
    shuffleRevision: 3,
    position: [-2, 0.14, 0],
    items: [
      {
        id: 'paul-disc-item',
        faceUp: true,
        artwork: { front: FRONT, back: 'https://example.test/back.png', name: 'Paul', type: 'token-disc' },
      },
    ],
  });
  const table = new Room(
    snapshot,
    () => ['harkonnen', 'atreides'],
    (id) => (id === bob.userId ? 'atreides' : undefined)
  );
  const send = (action: RoomAction) => table.accept(table.command(bob, action, table.snapshot.revision, LATER));
  return { table, send };
}

test('a leader played face down out of a hand cannot be told apart by the ids or key it showed face up', () => {
  const { table, send } = room();
  const projection = new RoomProjection('secret');
  const seen = projection.snapshot(table.snapshot).table.pieces.find((piece) => piece.id === LEADER)!;
  expect(seen.items[0]!.artwork?.front).toBe(FRONT);

  send({ kind: 'flip', pieceId: LEADER });
  send({ kind: 'flip', pieceId: LEADER });
  send({ kind: 'hand-take', pieceId: LEADER });
  send({ kind: 'hand-play', pieceId: LEADER, position: [1, 0, 1] });

  const view = projection.snapshot(table.snapshot);
  const played = view.table.pieces.find(
    (piece) => piece.owner === 'atreides' && piece.stackKey?.startsWith('leader:')
  )!;
  expect(played.items[0]!.faceUp).toBe(false);
  expect(played.items[0]!.artwork).not.toHaveProperty('front');
  expect(played.id).not.toBe(seen.id);
  expect(played.items[0]!.id).not.toBe(seen.items[0]!.id);
  expect(played.stackKey).not.toBe(seen.stackKey);
  /* Nor by how often it was turned over while everyone watched. */
  expect(played.flipRevision).toBeUndefined();
  expect(played.shuffleRevision).toBeUndefined();
  const sent = JSON.stringify(view);
  for (const known of [seen.id, seen.items[0]!.id, seen.stackKey!]) {
    expect(sent).not.toContain(known);
  }
});

test('the leader played out of the hand is still the player’s to turn over and pick up again', () => {
  const { table, send } = room();
  send({ kind: 'hand-take', pieceId: LEADER });
  send({ kind: 'hand-play', pieceId: LEADER, position: [1, 0, 1] });
  const played = table.snapshot.table.pieces.find((piece) => piece.stackKey === 'leader:atreides:paul')!;
  send({ kind: 'flip', pieceId: played.id });
  expect(table.snapshot.table.pieces.find((piece) => piece.id === played.id)!.items[0]!.faceUp).toBe(true);
  send({ kind: 'hand-take', pieceId: played.id });
  expect(table.snapshot.factionInventories.atreides?.map((piece) => piece.id)).toEqual([played.id]);
});

test('catalogue discs of one asset share a key face up and are told apart face down, as the page previews the merges the room makes', () => {
  const { table } = room();
  const troop = table.snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  const disc = (id: string, x: number, faceUp: boolean) => ({
    ...structuredClone(troop),
    id,
    owner: 'shared',
    label: 'Marker',
    stackKey: 'token:marker-asset',
    position: [x, 0.14, 3] as [number, number, number],
    items: [
      {
        id: `${id}-item`,
        faceUp,
        artwork: { front: FRONT, back: 'https://example.test/back.png', name: 'Marker', type: 'token-disc' },
      },
    ],
  });
  const projection = new RoomProjection('secret');
  const up = [disc('disc-one', 3, true), disc('disc-two', 5, true)] as const;
  const [upLeft, upRight] = up.map((piece) => projection.piece(piece));
  expect(upLeft!.stackKey).toBe(upRight!.stackKey);
  expect(piecesCanStack(upLeft!, upRight!)).toBe(piecesCanStack(...up));
  expect(piecesCanStack(upLeft!, upRight!)).toBe(true);
  /* Face down, either disc may be a hidden leader: the room stacks it with nothing, and the page sees keys that match nothing. */
  const down = [disc('disc-three', 7, false), disc('disc-four', 9, false)] as const;
  const [downLeft, downRight] = down.map((piece) => projection.piece(piece));
  expect(downLeft!.stackKey).not.toBe(downRight!.stackKey);
  expect(piecesCanStack(downLeft!, downRight!)).toBe(piecesCanStack(...down));
  expect(piecesCanStack(downLeft!, downRight!)).toBe(false);
});
