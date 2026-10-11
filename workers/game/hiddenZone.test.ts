import { describe, expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { treacheryHandCounts } from '../../src/shared/play/handCounts';
import { PHASE_CHANGE_COOLDOWN_MS, STANDARD_PHASES } from '../../src/shared/play/phases';
import { GameRejection } from '../../src/shared/play/rejection';
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
const LOOSE = 'treachery-card-loose';
const LEADER = 'fixture-leader';
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;

/* The fixture table, with its loose card given a Treachery face and a leader disc beside it, as Play/Sandbox's hands hold. */
function startingSnapshot() {
  const snapshot = { ...initialSnapshot(), roster: hostedFixturePlan.roster };
  const card = snapshot.table.pieces.find((piece) => piece.id === LOOSE)!;
  card.items[0]!.artwork = {
    front: 'https://example.test/card.png',
    back: 'https://example.test/back.png',
    name: 'Card',
    type: 'card-treachery',
  };
  const troop = snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  snapshot.table.pieces.push({
    ...structuredClone(troop),
    id: LEADER,
    label: 'Fixture leader',
    position: [-2, 0.14, 0],
    items: [
      {
        id: 'leader-item',
        faceUp: true,
        artwork: {
          front: 'https://example.test/leader.png',
          back: 'https://example.test/back.png',
          name: 'Leader',
          type: 'token-disc',
        },
      },
    ],
  });
  return snapshot;
}

function roomWithHand() {
  const room = new Room(
    startingSnapshot(),
    () => ['harkonnen', 'atreides'],
    (id) => FACTIONS[id]
  );
  const send = (action: RoomAction) => room.accept(room.command(bob, action, room.snapshot.revision, LATER));
  send({ kind: 'hand-take', pieceId: LOOSE });
  send({ kind: 'hand-take', pieceId: LEADER });
  const hand = () => room.snapshot.factionInventories.atreides ?? [];
  return { room, send, hand };
}

describe('the hidden zone', () => {
  test('lays a hand piece at a spot, and the last one arranged lies on top', () => {
    const { send, hand } = roomWithHand();
    send({ kind: 'hand-zone', pieceId: LOOSE, at: { x: 0.25, y: 0.5 } });
    send({ kind: 'hand-zone', pieceId: LEADER, at: { x: 0.3, y: 0.4 } });
    send({ kind: 'hand-zone', pieceId: LOOSE, at: { x: 0.6, y: 0.2 } });
    expect(hand().map((piece) => [piece.id, piece.hiddenZone])).toEqual([
      [LEADER, { x: 0.3, y: 0.4 }],
      [LOOSE, { x: 0.6, y: 0.2 }],
    ]);
  });

  test('moves a piece back to the plain inventory', () => {
    const { send, hand } = roomWithHand();
    send({ kind: 'hand-zone', pieceId: LOOSE, at: { x: 0.25, y: 0.5 } });
    send({ kind: 'hand-zone', pieceId: LOOSE, at: null });
    expect(hand().find((piece) => piece.id === LOOSE)).not.toHaveProperty('hiddenZone');
  });

  test('keeps the piece in the hand, so its card still counts toward the public hand size', () => {
    const { room, send } = roomWithHand();
    const before = treacheryHandCounts(room.snapshot.factionInventories, ['atreides']);
    send({ kind: 'hand-zone', pieceId: LOOSE, at: { x: 0.25, y: 0.5 } });
    expect(before).toEqual({ atreides: 1 });
    expect(treacheryHandCounts(room.snapshot.factionInventories, ['atreides'])).toEqual(before);
  });

  test('forgets the spot when the piece is played onto the table', () => {
    const { room, send } = roomWithHand();
    send({ kind: 'hand-zone', pieceId: LEADER, at: { x: 0.25, y: 0.5 } });
    send({ kind: 'hand-play', pieceId: LEADER, position: [1, 0, 1] });
    const played = room.snapshot.table.pieces.find((piece) => piece.id === LEADER);
    expect(played).toBeDefined();
    expect(played).not.toHaveProperty('hiddenZone');
  });

  test('forgets the spot when the piece goes into a battle plan, which may be disclosed', () => {
    const { room, send } = roomWithHand();
    send({ kind: 'hand-zone', pieceId: LOOSE, at: { x: 0.25, y: 0.5 } });
    room.snapshot.phase = STANDARD_PHASES.findIndex((phase) => phase.id === 'battle');
    send({ kind: 'battle-start', anchor: [0, 0, 0], territory: 'Arrakeen' });
    const battleId = room.snapshot.battleState!.id;
    send({ kind: 'battle-claim', battleId, side: 0 });
    send({
      kind: 'battle-plan',
      battleId,
      plan: { mode: 'max', troops: [], spice: 0, adjustment: 0, leaderId: null, cardIds: [LOOSE] },
    });
    expect(room.snapshot.battleState!.plans[0]!.pieces.map((piece) => piece.id)).toEqual([LOOSE]);
    expect(JSON.stringify(room.snapshot.battleState)).not.toContain('hiddenZone');
  });

  test('refuses a piece that is not in the hand', () => {
    const { room } = roomWithHand();
    expect(() =>
      room.command(
        bob,
        { kind: 'hand-zone', pieceId: 'treachery-deck', at: { x: 0.5, y: 0.5 } },
        room.snapshot.revision,
        LATER
      )
    ).toThrow(GameRejection);
  });

  test('is shown to its own faction only', () => {
    const { room, send } = roomWithHand();
    send({ kind: 'hand-zone', pieceId: LEADER, at: { x: 0.25, y: 0.5 } });
    const projection = new RoomProjection('secret');
    expect(
      projection.snapshot(room.snapshot, 'atreides').hand?.find((piece) => piece.id === LEADER)?.hiddenZone
    ).toEqual({ x: 0.25, y: 0.5 });
    expect(JSON.stringify(projection.snapshot(room.snapshot, 'harkonnen'))).not.toContain('hiddenZone');
    expect(JSON.stringify(projection.snapshot(room.snapshot))).not.toContain('hiddenZone');
  });
});
