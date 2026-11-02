import { describe, expect, test } from 'vite-plus/test';

import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
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
const FACTIONS: Record<string, string> = { [bob.userId]: 'atreides' };
const TECH = 'tech-heighliners';
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;
const ARTWORK = {
  front: 'https://example.test/heighliners.png',
  back: 'https://example.test/tech-back.png',
  name: 'Heighliners',
  type: 'token-tech',
  description: 'Ship two extra troops.',
};

/* The fixture table with one Heighliners tech token drawn face up onto it, as a draw from the Shared table inventory leaves it. */
function roomWithTechToken() {
  const snapshot = { ...initialSnapshot(), roster: hostedFixturePlan.roster };
  const troop = snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  snapshot.table.pieces.push({
    ...structuredClone(troop),
    id: TECH,
    label: 'Heighliners',
    owner: 'shared',
    stackKey: `token:${TECH}`,
    position: [-2, 0.14, 0],
    items: [{ id: `${TECH}-item`, faceUp: true, artwork: ARTWORK }],
  });
  const room = new Room(
    snapshot,
    () => ['harkonnen', 'atreides'],
    (id) => FACTIONS[id]
  );
  const send = (action: RoomAction) => room.accept(room.command(bob, action, room.snapshot.revision, LATER));
  return { room, send };
}

describe('a tech token in hand', () => {
  test('is taken from the table into the hand', () => {
    const { room, send } = roomWithTechToken();
    send({ kind: 'hand-take', pieceId: TECH });
    expect(room.snapshot.table.pieces.some((piece) => piece.id === TECH)).toBe(false);
    expect(room.snapshot.factionInventories.atreides?.map((piece) => piece.id)).toEqual([TECH]);
  });

  test('shows every viewer who holds it, face and words, but never the piece it is', () => {
    const { room, send } = roomWithTechToken();
    send({ kind: 'hand-take', pieceId: TECH });
    const projection = new RoomProjection('secret');
    const held = {
      atreides: [{ back: ARTWORK.back, front: ARTWORK.front, name: 'Heighliners', description: ARTWORK.description }],
    };
    expect(projection.snapshot(room.snapshot).techTokens).toEqual(held);
    expect(projection.snapshot(room.snapshot, 'harkonnen').techTokens).toEqual(held);
    expect(JSON.stringify(projection.snapshot(room.snapshot, 'harkonnen').techTokens)).not.toContain(TECH);
  });

  test('still counts as held on the private side-table', () => {
    const { room, send } = roomWithTechToken();
    send({ kind: 'hand-take', pieceId: TECH });
    send({ kind: 'hand-zone', pieceId: TECH, at: { x: 0.25, y: 0.5 } });
    expect(new RoomProjection('secret').snapshot(room.snapshot, 'harkonnen').techTokens?.atreides).toHaveLength(1);
  });

  test('lands face up when played back onto the table, as it is public', () => {
    const { room, send } = roomWithTechToken();
    send({ kind: 'hand-take', pieceId: TECH });
    send({ kind: 'hand-play', pieceId: TECH, position: [1, 0, 1] });
    expect(room.snapshot.table.pieces.find((piece) => piece.id === TECH)?.items[0]?.faceUp).toBe(true);
    expect(new RoomProjection('secret').snapshot(room.snapshot).techTokens).toEqual({});
  });

  test('is refused while locked', () => {
    const { room, send } = roomWithTechToken();
    room.snapshot.table.pieces.find((piece) => piece.id === TECH)!.locked = true;
    expect(() => send({ kind: 'hand-take', pieceId: TECH })).toThrow('Choose one unlocked card, leader or tech token');
  });
});
