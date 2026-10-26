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
  const card = (id: string, name: string, type: string) => ({
    ...structuredClone(loose),
    id,
    items: [
      {
        id: `${id}-item`,
        faceUp: true,
        artwork: { front: 'https://example.test/c.png', back: 'https://example.test/b.png', name, type },
      },
    ],
  });
  snapshot.table.pieces.push(
    leader('stilgar', 'Stilgar'),
    leader('chani', 'Chani'),
    card('kept-traitor', 'Traitor', 'card-traitor'),
    card('kept-alliance', 'Alliance', 'card-alliance'),
    card('spice-card', 'Spice', 'card-spice')
  );
  const room = new Room(
    snapshot,
    () => ['harkonnen', 'atreides'],
    (id) => FACTIONS[id]
  );
  const send = (action: RoomAction) => room.accept(room.command(bob, action, room.snapshot.revision, LATER));
  for (const pieceId of ['stilgar', 'chani', 'kept-traitor', 'kept-alliance', 'spice-card']) {
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

  test('refuses a Spice card too: the check asks for Treachery, not for what to leave out', () => {
    const { room, battleId, plan } = battleRoom();
    expect(() =>
      room.command(
        bob,
        { kind: 'battle-plan', battleId, plan: plan({ cardIds: ['spice-card'] }) } as RoomAction,
        room.snapshot.revision,
        LATER
      )
    ).toThrow(GameRejection);
  });

  test('lets an older plan that holds a Traitor and an Alliance card give them up one at a time', () => {
    const { room, send, battleId, plan } = battleRoom();
    const kept = ['kept-traitor', 'kept-alliance'];
    const inventory = room.snapshot.factionInventories.atreides!;
    const stored = room.snapshot.battleState!.plans[0]!;
    stored.cardIds = kept;
    stored.pieces = inventory.filter((piece) => kept.includes(piece.id));
    room.snapshot.factionInventories.atreides = inventory.filter((piece) => !kept.includes(piece.id));
    send({ kind: 'battle-plan', battleId, plan: plan({ cardIds: ['kept-alliance'] }) } as RoomAction);
    expect(room.snapshot.battleState!.plans[0]!.cardIds).toEqual(['kept-alliance']);
    expect(() =>
      room.command(
        bob,
        { kind: 'battle-plan', battleId, plan: plan({ cardIds: ['kept-alliance', 'kept-traitor'] }) } as RoomAction,
        room.snapshot.revision,
        LATER
      )
    ).toThrow(GameRejection);
    send({ kind: 'battle-plan', battleId, plan: plan({ cardIds: [] }) } as RoomAction);
    expect(room.snapshot.battleState!.plans[0]!.cardIds).toEqual([]);
  });
});
