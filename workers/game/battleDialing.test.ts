import { describe, expect, test } from 'vite-plus/test';

import type { BattleFace } from '../../src/shared/play/battle';
import { kissSpice } from '../../src/shared/play/battleDialing';
import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS, STANDARD_PHASES } from '../../src/shared/play/phases';
import { GameRejection } from '../../src/shared/play/rejection';
import type { BattleDialing } from '../../src/shared/rulesets/battleDialing';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

type Identity = Parameters<Room['command']>[0];
type RoomAction = Parameters<Room['command']>[1];

const bob: Identity = {
  connectionId: 'bob-connection',
  userId: 'bob-user',
  viewerSeat: 'atreides',
  displayName: 'bob',
  color: '#d0c8b9',
};
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;

const face = (id: string, values: Partial<BattleFace> = {}): BattleFace => ({
  id,
  name: id,
  capable: true,
  strength: 0.5,
  supportedStrength: 1,
  supportCost: 1,
  ...values,
});
const ORDINARY = face('ordinary');
const ELITE = face('elite', { strength: 1, supportedStrength: 2 });
const FREMEN = face('fedaykin', { strength: 1, supportedStrength: 1, supportCost: 0 });

/** Atreides claims a side in a battle counted by the given mechanism, with these troop faces and this much spice. */
function battleRoom(dialing: BattleDialing, faces: BattleFace[] = [ORDINARY, ELITE], spice = 20) {
  const room = new Room(
    { ...initialSnapshot(), roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    () => 'atreides'
  );
  room.snapshot.battleDialing = dialing;
  room.snapshot.combatFaces = { atreides: faces };
  room.snapshot.factionBanks = { atreides: spice };
  room.snapshot.phase = STANDARD_PHASES.findIndex((phase) => phase.id === 'battle');
  const send = (action: RoomAction) => room.accept(room.command(bob, action, room.snapshot.revision, LATER));
  send({ kind: 'battle-start', anchor: [0, 0, 0], territory: 'Arrakeen' });
  const battleId = room.snapshot.battleState!.id;
  send({ kind: 'battle-claim', battleId, side: 0 });
  const dial = (troops: Record<string, number>, extra: object = {}) =>
    send({
      kind: 'battle-plan',
      battleId,
      plan: {
        mode: 'max',
        troops: Object.entries(troops).map(([faceId, count]) => ({ faceId, undialed: count, dialed: 0 })),
        spice: 0,
        adjustment: 0,
        leaderIds: [],
        cardIds: [],
        ...extra,
      },
    } as RoomAction);
  const plan = () => room.snapshot.battleState!.plans[0]!;
  const bank = () => room.snapshot.factionBanks.atreides;
  return { dial, plan, bank };
}

describe('battle dialing mechanisms', () => {
  test('a plan carries the mechanism its game was set up with', () => {
    expect(battleRoom('kiss').plan().dialing).toBe('kiss');
  });

  test('Advanced counts unsupported troops at half strength and supported ones at full', () => {
    const { dial, plan } = battleRoom('advanced');
    dial({ ordinary: 3 }, { spice: 1 });
    expect(plan()).toMatchObject({ strength: 2, spice: 1 });
  });

  test('Basic counts every troop at full strength and spends no spice', () => {
    const { dial, plan, bank } = battleRoom('basic');
    dial({ ordinary: 3, elite: 1 }, { spice: 5, mode: 'custom' });
    expect(plan()).toMatchObject({ strength: 5, spice: 0, mode: 'max' });
    expect(plan().troops).toEqual([
      { faceId: 'ordinary', undialed: 3, dialed: 0 },
      { faceId: 'elite', undialed: 1, dialed: 0 },
    ]);
    expect(bank()).toBe(20);
  });

  test('GF9 2.0 adds spice strength for 2, 4 or 8 spice once the dial reaches it', () => {
    const { dial, plan, bank } = battleRoom('gf92');
    dial({ ordinary: 4, elite: 1 }, { spice: 4 });
    expect(plan()).toMatchObject({ strength: 6 + 2, spice: 4 });
    expect(bank()).toBe(16);
    expect(() => dial({ ordinary: 4, elite: 1 }, { spice: 8 })).toThrow(GameRejection);
    expect(() => dial({ ordinary: 4, elite: 1 }, { spice: 3 })).toThrow(GameRejection);
  });

  test('GF9 2.0 lowers the spice strength when the dial drops below it', () => {
    const { dial, plan } = battleRoom('gf92');
    dial({ ordinary: 4 }, { spice: 4 });
    dial({ ordinary: 3 }, { spice: 4 });
    expect(plan()).toMatchObject({ strength: 3 + 1, spice: 2 });
  });

  test('GF9 2.0 gives a dial of troops that cost nothing its spice strength for free', () => {
    const { dial, plan } = battleRoom('gf92', [FREMEN]);
    dial({ fedaykin: 8 });
    expect(plan()).toMatchObject({ strength: 8 + 3, spice: 0 });
  });

  test('KISS dials two troops free and charges a spice for each further troop', () => {
    const { dial, plan, bank } = battleRoom('kiss');
    dial({ ordinary: 2 });
    expect(plan()).toMatchObject({ strength: 2, spice: 0 });
    dial({ ordinary: 1, elite: 3 });
    expect(plan()).toMatchObject({ strength: 7, spice: 2 });
    expect(bank()).toBe(18);
  });

  test('KISS refuses a dial past 20 and a dial the spice cannot pay', () => {
    expect(() => battleRoom('kiss').dial({ elite: 11 })).toThrow(GameRejection);
    expect(() => battleRoom('kiss', [ORDINARY], 1).dial({ ordinary: 4 })).toThrow(GameRejection);
  });

  test('KISS lets troops that cost nothing to dial fight in any number for free', () => {
    const { dial, plan } = battleRoom('kiss', [FREMEN], 0);
    dial({ fedaykin: 10 });
    expect(plan()).toMatchObject({ strength: 10, spice: 0 });
  });

  test('KISS charges each troop its own dial cost, with the 2 free places going to troops that cost spice', () => {
    const { dial, plan } = battleRoom('kiss', [ORDINARY, FREMEN]);
    dial({ ordinary: 3, fedaykin: 4 });
    expect(plan()).toMatchObject({ strength: 7, spice: 1 });
  });

  test('KISS counts the spice of a huge declaration per face, without a step per troop', () => {
    const many = 2 ** 32;
    expect(kissSpice([{ faceId: 'ordinary', undialed: many, dialed: 0 }], [ORDINARY])).toBe(many - 2);
  });

  test('KISS takes a huge declaration of troops that add nothing without stalling the room', () => {
    const { dial, plan } = battleRoom('kiss', [face('blank', { strength: 0, supportedStrength: 0, supportCost: 0 })]);
    dial({ blank: 2 ** 32 });
    expect(plan()).toMatchObject({ strength: 0, spice: 0 });
  });

  test('GF9 2.0 spice strength is free only when every dialed troop costs nothing to dial', () => {
    const { dial, plan } = battleRoom('gf92', [ORDINARY, FREMEN]);
    dial({ fedaykin: 4 });
    expect(plan()).toMatchObject({ strength: 4 + 2, spice: 0 });
    dial({ ordinary: 1, fedaykin: 4 }, { spice: 4 });
    expect(plan()).toMatchObject({ strength: 5 + 2, spice: 4 });
  });
});
