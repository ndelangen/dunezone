import { describe, expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';
import { openPeek, RoomProjection } from './state';

type RoomAction = Parameters<Room['command']>[1];
type Kind = RoomAction['kind'];
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
const FACTIONS: Record<string, string> = { [alice.userId]: 'harkonnen', [bob.userId]: 'atreides' };
const DECK = 'treachery-deck';
const LOOSE = 'treachery-card-loose';
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;

function peekedRoom() {
  const room = new Room(
    { ...initialSnapshot(), roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    (id) => FACTIONS[id]
  );
  room.accept(room.command(alice, { kind: 'peek', pieceId: DECK }, room.snapshot.revision, LATER));
  const granted = new Set(room.snapshot.table.pieces.find((piece) => piece.id === DECK)!.items.map((item) => item.id));
  expect(openPeek(room.snapshot, 'harkonnen')?.items).toHaveLength(granted.size);
  return { room, granted };
}

/* What the peeker is shown, by stored card id; the projection hands on exactly this many faces. */
function shown(room: Room) {
  const items = openPeek(room.snapshot, 'harkonnen')?.items ?? [];
  expect(new RoomProjection('secret').snapshot(room.snapshot, 'harkonnen').peek?.piece.items ?? []).toHaveLength(
    items.length
  );
  return items.map((item) => item.id);
}

type Step = readonly [Identity, RoomAction];
const deck = (room: Room) => room.snapshot.table.pieces.find((piece) => piece.id === DECK);
const battleId = (room: Room) => room.snapshot.battleState?.id ?? 'battle';

/*
 * Every room command, as both factions send it, against a deck the peeker holds open.
 * The record is keyed by every kind the room takes, so a new command fails to compile until it is listed here.
 */
const STEPS: Record<Kind, (room: Room) => Step[]> = {
  'battle-start': (room) => [
    [bob, { kind: 'battle-start', anchor: deck(room)?.position ?? [0, 0, 0], territory: 'Arrakeen' }],
  ],
  'battle-claim': (room) => [[bob, { kind: 'battle-claim', battleId: battleId(room), side: 0 }]],
  'battle-plan': (room) => [
    [
      bob,
      {
        kind: 'battle-plan',
        battleId: battleId(room),
        plan: { mode: 'max', troops: [], cardIds: [DECK], spice: 0 },
      } as unknown as RoomAction,
    ],
  ],
  'battle-ready': (room) => [[bob, { kind: 'battle-ready', battleId: battleId(room), ready: true }]],
  'battle-cancel': (room) => [[bob, { kind: 'battle-cancel', battleId: battleId(room) }]],
  'battle-outcome': (room) => [[bob, { kind: 'battle-outcome', battleId: battleId(room), outcome: 'left' }]],
  'bid-start': () => [[bob, { kind: 'bid-start', factionId: 'atreides' }]],
  'bid-reset': () => [[bob, { kind: 'bid-reset' }]],
  'bid-raise': (room) => [[bob, { kind: 'bid-raise', round: room.snapshot.bidding?.round ?? 1 }]],
  'bid-pass': (room) => [[bob, { kind: 'bid-pass', round: room.snapshot.bidding?.round ?? 1 }]],
  'bid-seconds': () => [[bob, { kind: 'bid-seconds', seconds: 30 }]],
  'alliance-offer': () => [[bob, { kind: 'alliance-offer', factionId: 'harkonnen' }]],
  'alliance-withdraw': () => [[bob, { kind: 'alliance-withdraw', factionId: 'harkonnen' }]],
  'alliance-accept': () => [[bob, { kind: 'alliance-accept', factionId: 'harkonnen' }]],
  'alliance-decline': () => [[bob, { kind: 'alliance-decline', factionId: 'harkonnen' }]],
  'alliance-break': () => [[bob, { kind: 'alliance-break' }]],
  'hand-take': () => [[bob, { kind: 'hand-take', pieceId: DECK }]],
  /* A card from a hand played onto the deck. */
  'hand-play': (room) => [
    [bob, { kind: 'hand-take', pieceId: LOOSE }],
    [
      bob,
      {
        kind: 'hand-play',
        pieceId: room.snapshot.factionInventories.atreides?.[0]?.id ?? LOOSE,
        position: deck(room)!.position,
      },
    ],
  ],
  'bank-withdraw': () => [[bob, { kind: 'bank-withdraw', amount: 1 }]],
  'bank-collect': () => [[bob, { kind: 'bank-collect', pieceId: DECK }]],
  ready: () => [[bob, { kind: 'ready', ready: true }]],
  'spawn-request': () => [[bob, { kind: 'spawn-request', type: 'deck', slug: 'treachery' }]],
  'spawn-approve': () => [[bob, { kind: 'spawn-approve', requestId: 'request' }]],
  'spawn-dismiss': () => [[bob, { kind: 'spawn-dismiss', requestId: 'request' }]],
  'prediction-lock': () => [
    [bob, { kind: 'prediction-lock', stepId: 'step', choice: { factionId: 'harkonnen', turn: 1 } }],
  ],
  'prediction-reveal': () => [[bob, { kind: 'prediction-reveal', stepId: 'step' }]],
  'traitors-gather': () => [[bob, { kind: 'traitors-gather' }]],
  'storm-random': () => [[bob, { kind: 'storm-random' }]],
  split: () => [[bob, { kind: 'split', pieceId: DECK, count: 1 }]],
  stack: () => [[bob, { kind: 'stack', pieceId: LOOSE }]],
  flip: () => [[bob, { kind: 'flip', pieceId: DECK }]],
  lock: () => [[bob, { kind: 'lock', pieceId: DECK }]],
  rotate: () => [[bob, { kind: 'rotate', pieceId: DECK, direction: 1 }]],
  storm: () => [[bob, { kind: 'storm', direction: 1 }]],
  phase: () => [[bob, { kind: 'phase' }]],
  turn: () => [[bob, { kind: 'turn', turn: 2 }]],
  'spice-spawn': () => [[bob, { kind: 'spice-spawn', count: 1 }]],
  reset: () => [[bob, { kind: 'reset' }]],
  'deck-draw': () => [[bob, { kind: 'deck-draw', pieceId: DECK }]],
  'deck-shuffle': () => [[bob, { kind: 'deck-shuffle', pieceId: DECK }]],
  peek: () => [[bob, { kind: 'peek', pieceId: DECK }]],
  'peek-close': () => [[bob, { kind: 'peek-close' }]],
  'peek-arrange': () => [[alice, { kind: 'peek-arrange', pieceId: DECK, order: [3, 2, 1, 0] }]],
  'peek-pull': () => [[alice, { kind: 'peek-pull', pieceId: DECK, index: 0 }]],
};

describe('an open peek never shows a card it was not granted', () => {
  test.each(Object.keys(STEPS) as Kind[])('%s', (kind) => {
    const { room, granted } = peekedRoom();
    let expected = [...granted];
    for (const actor of [bob, alice]) {
      for (const [, action] of STEPS[kind](room)) {
        try {
          room.accept(room.command(actor, action, room.snapshot.revision, LATER));
          /* The peeker's own change to the deck it holds open renews the grant on the deck as it then stands. */
          if (actor === alice && action.kind.startsWith('peek-')) {
            expected = deck(room)?.items.map((item) => item.id) ?? [];
          }
        } catch {
          /* A refusal changes nothing; the peek is checked all the same. */
        }
        /* The peeker sees the deck exactly as granted, in that order, or nothing at all. */
        const seen = shown(room);
        expect(seen.length === 0 ? [] : expected).toEqual(seen);
      }
    }
  });

  test('a card dropped onto the deck closes the peek', () => {
    const { room, granted } = peekedRoom();
    room.begin(bob, {
      carryId: 'onto-deck',
      sourcePieceId: LOOSE,
      expectedVersion: room.snapshot.versions[LOOSE] ?? 0,
      pickup: 'whole',
    });
    room.accept(room.drop(bob, 'onto-deck', deck(room)!.position, 0), 'onto-deck');
    expect(deck(room)?.items).toHaveLength(granted.size + 1);
    expect(shown(room)).toEqual([]);
    expect(room.snapshot.peeks).toEqual({});
  });

  test('a card taken off the deck and dropped back on top closes the peek', () => {
    const { room } = peekedRoom();
    room.begin(bob, {
      carryId: 'off-deck',
      sourcePieceId: DECK,
      expectedVersion: room.snapshot.versions[DECK] ?? 0,
      pickup: 'top',
    });
    room.accept(room.drop(bob, 'off-deck', [0, 0.38, 0], 0), 'off-deck');
    expect(room.snapshot.peeks).toEqual({});
  });

  test('a state the session sets on the room, as a roster change does, is reconciled too', () => {
    const { room } = peekedRoom();
    const shuffled = room.snapshot.table.pieces.map((piece) =>
      piece.id === DECK ? { ...piece, items: [...piece.items].reverse() } : piece
    );
    room.snapshot = { ...room.snapshot, table: { ...room.snapshot.table, pieces: shuffled } };
    expect(shown(room)).toEqual([]);
    expect(room.snapshot.peeks).toEqual({});
  });

  test("the peeker's own arrangement and pull keep the peek open, granted on the deck as it then stands", () => {
    const { room, granted } = peekedRoom();
    room.accept(
      room.command(alice, { kind: 'peek-arrange', pieceId: DECK, order: [3, 2, 1, 0] }, room.snapshot.revision, LATER)
    );
    expect(shown(room)).toEqual([...granted].reverse());
    room.accept(room.command(alice, { kind: 'peek-pull', pieceId: DECK, index: 0 }, room.snapshot.revision, LATER));
    expect(shown(room)).toHaveLength(granted.size - 1);
  });
});
