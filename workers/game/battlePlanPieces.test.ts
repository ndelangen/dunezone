import { describe, expect, test } from 'vite-plus/test';

import { initialSnapshot } from '../../src/shared/play/commands';
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
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;

/* The fixture table with two leader discs and a Traitor card beside its loose card, all taken into Atreides' hand. */
function battleRoom() {
  const snapshot = { ...initialSnapshot(), roster: hostedFixturePlan.roster };
  const loose = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
  const troop = snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;
  const leader = (id: string, name: string) => ({
    ...structuredClone(troop),
    id,
    label: name,
    items: [
      {
        id: `${id}-item`,
        faceUp: true,
        artwork: { front: 'https://example.test/l.png', back: 'https://example.test/b.png', name, type: 'token-disc' },
      },
    ],
  });
  const traitor = {
    ...structuredClone(loose),
    id: 'kept-traitor',
    items: [
      {
        id: 'kept-traitor-item',
        faceUp: true,
        artwork: {
          front: 'https://example.test/t.png',
          back: 'https://example.test/b.png',
          name: 'Traitor',
          type: 'card-traitor',
        },
      },
    ],
  };
  snapshot.table.pieces.push(leader('stilgar', 'Stilgar'), leader('chani', 'Chani'), traitor);
  const room = new Room(
    snapshot,
    () => ['harkonnen', 'atreides'],
    (id) => FACTIONS[id]
  );
  const send = (action: RoomAction) => room.accept(room.command(bob, action, room.snapshot.revision, LATER));
  for (const pieceId of ['stilgar', 'chani', 'kept-traitor']) {
    send({ kind: 'hand-take', pieceId });
  }
  room.snapshot.phase = STANDARD_PHASES.findIndex((phase) => phase.id === 'battle');
  send({ kind: 'battle-start', anchor: [0, 0, 0], territory: 'Arrakeen' });
  const battleId = room.snapshot.battleState!.id;
  send({ kind: 'battle-claim', battleId, side: 0 });
  const plan = (extra: object) => ({
    mode: 'max',
    troops: [],
    spice: 0,
    adjustment: 0,
    leaderIds: [],
    cardIds: [],
    ...extra,
  });
  return { room, send, battleId, plan };
}

describe('the pieces of a battle plan', () => {
  test('may hold several leaders, and showing them early shows them all', () => {
    const { room, send, battleId, plan } = battleRoom();
    send({ kind: 'battle-plan', battleId, plan: plan({ leaderIds: ['stilgar', 'chani'] }) } as RoomAction);
    expect(room.snapshot.battleState!.plans[0]!.pieces.map((piece) => piece.id)).toEqual(['stilgar', 'chani']);
    send({ kind: 'battle-disclose', battleId, disclosure: { element: 'leader' }, shown: true });
    const disclosed = new RoomProjection('secret').snapshot(room.snapshot, 'harkonnen').battle?.disclosed?.[0];
    expect(disclosed?.leaders?.map((piece) => piece.id)).toEqual(['stilgar', 'chani']);
  });

  test('refuses a Traitor card: only Treachery cards go into a plan', () => {
    const { room, battleId, plan } = battleRoom();
    expect(() =>
      room.command(
        bob,
        { kind: 'battle-plan', battleId, plan: plan({ cardIds: ['kept-traitor'] }) } as RoomAction,
        room.snapshot.revision,
        LATER
      )
    ).toThrow(GameRejection);
  });
});
