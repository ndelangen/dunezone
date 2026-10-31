import { emptyBattlePlan } from '@shared/play/battle';
import type { BattleFace } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { piece } from '@shared/play/setupSupply';
import { expect, test } from 'vite-plus/test';

import {
  cardsOf,
  fullSupport,
  planPieces,
  snapSpice,
  supportMatters,
  toggleIn,
  toggleLeader,
  troopLimitOf,
} from './planView';

const card = (id: string, extra: Partial<TablePiece> = {}): TablePiece => ({
  ...piece(id, 'Card', 'house-harkonnen', '#000', 'card', 'cards:treachery'),
  items: [],
  ...extra,
});

test('a piece arranged on the private side-table can still be chosen for battle', () => {
  const arranged = card('arranged', { hiddenZone: { x: 0.5, y: 0.5 } });
  const pieces = planPieces({ ...emptyBattlePlan([]), pieces: [] }, [card('held'), arranged]);
  expect(pieces.map((entry) => entry.id)).toEqual(['held', 'arranged']);
});

test("the plan's own pieces join the hand once each", () => {
  const committed = card('committed');
  const pieces = planPieces({ ...emptyBattlePlan([]), pieces: [committed] }, [card('held'), committed]);
  expect(pieces.map((entry) => entry.id)).toEqual(['held', 'committed']);
});

test('a leader joins the ones already in the plan, and a second click takes only that one out', () => {
  const plan = { ...emptyBattlePlan([]), pieces: [], leaderIds: ['stilgar'] };
  expect(toggleLeader(plan, 'chani')).toEqual({ leaderIds: ['stilgar', 'chani'] });
  expect(toggleLeader({ ...plan, leaderIds: ['stilgar', 'chani'] }, 'stilgar')).toEqual({ leaderIds: ['chani'] });
});

test('a Traitor card stays out of the picker, unless an older plan already holds it and it has to come out', () => {
  const traitor = (id: string) =>
    card(id, {
      items: [
        { id: `${id}-item`, faceUp: true, artwork: { front: 'f', back: 'b', name: 'Traitor', type: 'card-traitor' } },
      ],
    });
  const pieces = [card('treachery', { items: [{ id: 't', faceUp: true }] }), traitor('loose'), traitor('kept')];
  expect(cardsOf(pieces, []).map((entry) => entry.id)).toEqual(['treachery']);
  expect(cardsOf(pieces, ['kept']).map((entry) => entry.id)).toEqual(['treachery', 'kept']);
});

test("choosing a piece keeps the player's order, and the plan takes the chosen ones in that order", () => {
  const order = ['crysknife', 'shield', 'chaumas'];
  expect(toggleIn(['chaumas'], 'crysknife', order)).toEqual(['crysknife', 'chaumas']);
  expect(toggleIn(['crysknife', 'chaumas'], 'crysknife', order)).toEqual(['chaumas']);
});

const face = (values: Partial<BattleFace>): BattleFace => ({
  id: 'troop-0-front',
  name: 'Troops',
  capable: true,
  strength: 0.5,
  supportedStrength: 1,
  supportCost: 1,
  ...values,
});

test('All supports only as many whole troops as the spice pays for exactly', () => {
  const plan = {
    ...emptyBattlePlan([face({ supportCost: 2 })]),
    pieces: [],
    troops: [{ faceId: 'troop-0-front', undialed: 2, dialed: 0 }],
  };
  expect(fullSupport(plan, 3)).toBe(2);
  expect(fullSupport(plan, 4)).toBe(4);
  expect(fullSupport(plan, 9)).toBe(4);
});

test('a spice amount no troops add up to moves on to one that does, the way it was moved', () => {
  const plan = {
    ...emptyBattlePlan([face({ supportCost: 2 })]),
    pieces: [],
    spice: 2,
    troops: [{ faceId: 'troop-0-front', undialed: 1, dialed: 1 }],
  };
  expect(snapSpice(plan, 6, 3)).toBe(4);
  expect(snapSpice(plan, 6, 1)).toBe(0);
  /* Past what the troops can use, it stops at the most they can. */
  expect(snapSpice(plan, 6, 5)).toBe(4);
  expect(snapSpice({ ...plan, troops: [] }, 6, 3)).toBe(0);
});

test('free support that still changes strength keeps its Custom choice, and a Custom plan never loses it', () => {
  const free = { ...emptyBattlePlan([face({ supportCost: 0, strength: 0.5, supportedStrength: 1.5 })]), pieces: [] };
  expect(supportMatters(free)).toBe(true);
  const even = { ...emptyBattlePlan([face({ supportCost: 0, strength: 1, supportedStrength: 1 })]), pieces: [] };
  expect(supportMatters(even)).toBe(false);
  expect(supportMatters({ ...even, mode: 'custom' })).toBe(true);
});

test("a troop's two faces share its count, so the back fields only what the front leaves", () => {
  const plan = {
    ...emptyBattlePlan([face({ id: 'troop-0-front' }), face({ id: 'troop-0-back' }), face({ id: 'troop-1-front' })]),
    pieces: [],
    troops: [{ faceId: 'troop-0-front', undialed: 12, dialed: 3 }],
  };
  const props = {
    plan,
    troopLimit: { 'troop-0-front': 20, 'troop-0-back': 20, 'troop-1-front': 4 },
    troopOf: { 'troop-0-front': '0', 'troop-0-back': '0', 'troop-1-front': '1' },
  };
  expect(troopLimitOf(props, 'troop-0-back')).toBe(5);
  expect(troopLimitOf(props, 'troop-0-front')).toBe(20);
  expect(troopLimitOf(props, 'troop-1-front')).toBe(4);
});

test('a KISS dial of troops that add no strength is bounded by the troops owned, not by a token count', () => {
  const plan = { ...emptyBattlePlan([face({ supportCost: 0, strength: 0, supportedStrength: 0 })], 'kiss'), pieces: [] };
  expect(troopLimitOf({ plan, troopLimit: { [plan.faces[0]!.id]: 30 }, balance: 0 }, plan.faces[0]!.id)).toBe(30);
});

test('a KISS dial of tiny-strength troops stops at the troops owned without stepping to the strength cap', () => {
  const tiny = face({ supportCost: 0, strength: 0.000001, supportedStrength: 0.000001 });
  const plan = { ...emptyBattlePlan([tiny], 'kiss'), pieces: [] };
  const started = performance.now();
  expect(troopLimitOf({ plan, troopLimit: { [tiny.id]: 20 }, balance: 0 }, tiny.id)).toBe(20);
  expect(performance.now() - started).toBeLessThan(100);
});

test('a KISS dial takes as many paying troops as the spice covers beyond the 2 free ones, and the strength cap still applies', () => {
  const ordinary = face({ supportCost: 1, strength: 0.5, supportedStrength: 1 });
  const plan = { ...emptyBattlePlan([ordinary], 'kiss'), pieces: [] };
  expect(troopLimitOf({ plan, troopLimit: { [ordinary.id]: 20 }, balance: 3 }, ordinary.id)).toBe(5);
  const elite = face({ supportCost: 0, strength: 2, supportedStrength: 2 });
  const capped = { ...emptyBattlePlan([elite], 'kiss'), pieces: [] };
  expect(troopLimitOf({ plan: capped, troopLimit: { [elite.id]: 20 }, balance: 0 }, elite.id)).toBe(10);
});
